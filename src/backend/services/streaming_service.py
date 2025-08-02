# File: src/backend/services/streaming_service.py

import asyncio
import json
import re
from typing import Dict, List, Any, Tuple, Optional
from fastapi import WebSocket

from ..core.logger import logger
from ..core.conversation_modes import should_use_tool_mode, get_conversation_context
from .memory_service import MemoryService
from .tool_service import ToolService

class StreamingService:
    """Service for handling streaming AI responses with memory injection"""
    
    def __init__(self):
        self.memory_service = MemoryService()
        self.tool_service = ToolService()
    
    async def generate_streaming_response(self, model, tokenizer, message: str, 
                                        context: dict, websocket: WebSocket) -> Tuple[str, List[str], List[dict]]:
        """
        ENHANCED streaming response with memory injection and tool processing
        Extracted from monolithic api.py
        """
        try:
            # Step 1: Recall relevant memories and inject into context
            memory_context = await self.memory_service.get_conversation_context(message)
            
            # Step 2: Build enhanced system prompt with memory
            available_tools = self.tool_service.get_available_tools()
            
            system_prompt = (
                f"{memory_context}"  # Inject memories first
                f"You are AIDE, a coding assistant. User: {message}\n"
                f"Available tools: {[tool['name'] for tool in available_tools]}\n"
                f"Context: {get_conversation_context(context)}\n"
                f"To use a tool, write TOOL[tool_name] in your response.\n"
                f"Keep responses under 3 sentences.\nAIDE:"
            )
            
            # Step 3: Generate response based on model backend
            response_text = await self._generate_with_backend(
                model, tokenizer, system_prompt, websocket
            )
            
            # Step 4: Process tool calls if any
            response_text, used_tools, actions = await self._process_tool_calls(
                response_text, message, context, websocket
            )
            
            # Step 5: Save interaction to memory
            await self.memory_service.save_interaction(
                user_message=message,
                ai_response=response_text,
                context=context
            )
            
            return response_text, used_tools, actions
            
        except Exception as e:
            error_msg = f"Streaming generation failed: {str(e)}"
            logger.error(error_msg)
            
            await websocket.send_json({
                "type": "stream_error",
                "error": error_msg,
                "complete": True
            })
            
            return error_msg, [], []
    
    async def _generate_with_backend(self, model, tokenizer, system_prompt: str, 
                                   websocket: WebSocket) -> str:
        """Generate response using the appropriate backend"""
        
        # LLAMA.CPP PATH - Best performance option
        if hasattr(model, 'backend') and hasattr(model.backend, 'generate_stream'):
            logger.info("🚀 Using llama.cpp streaming generation")
            return await self._generate_with_llamacpp(model, system_prompt, websocket)
        
        # OpenVINO PATH
        elif hasattr(model, 'backend') and hasattr(model.backend, 'generate_response'):
            logger.info("🚀 Using OpenVINO generation")
            return await self._generate_with_openvino(model, system_prompt, websocket)
        
        # PyTorch PATH
        else:
            logger.info("🚀 Using PyTorch generation")
            return await self._generate_with_pytorch(model, tokenizer, system_prompt, websocket)
    
    async def _generate_with_llamacpp(self, model, system_prompt: str, websocket: WebSocket) -> str:
        """Generate with llama.cpp backend"""
        try:
            response_text = ""
            chunk_count = 0
            max_chunks = 50  # Prevent infinite responses
            
            for chunk in model.backend.generate_stream(
                system_prompt,
                max_tokens=150,
                temperature=0.7,
                stop=["\\n\\n", "User:", "Human:", "\\nUser", "\\nHuman"]
            ):
                if chunk_count >= max_chunks:
                    break
                
                response_text += chunk
                await websocket.send_json({
                    "type": "stream_chunk",
                    "chunk": chunk,
                    "complete": False
                })
                
                chunk_count += 1
                await asyncio.sleep(0.01)  # Prevent overwhelming
            
            await websocket.send_json({
                "type": "stream_complete",
                "full_response": response_text.strip(),
                "complete": True
            })
            
            return response_text.strip()
            
        except Exception as e:
            error_msg = f"llama.cpp streaming failed: {str(e)}"
            logger.error(error_msg)
            
            await websocket.send_json({
                "type": "stream_error",
                "error": error_msg,
                "complete": True
            })
            
            return error_msg
    
    async def _generate_with_openvino(self, model, system_prompt: str, websocket: WebSocket) -> str:
        """Generate with OpenVINO backend"""
        try:
            response = model.backend.generate_response(
                system_prompt, 
                max_tokens=150, 
                temperature=0.7
            )
            
            # Stream character by character
            for i, char in enumerate(response[:300]):  # Cap at 300 chars
                await websocket.send_json({
                    "type": "stream_chunk",
                    "chunk": char,
                    "complete": False
                })
                await asyncio.sleep(0.02)
            
            await websocket.send_json({
                "type": "stream_complete",
                "full_response": response,
                "complete": True
            })
            
            return response
            
        except Exception as e:
            error_msg = f"OpenVINO streaming failed: {str(e)}"
            logger.error(error_msg)
            
            await websocket.send_json({
                "type": "stream_error",
                "error": error_msg,
                "complete": True
            })
            
            return error_msg
    
    async def _generate_with_pytorch(self, model, tokenizer, system_prompt: str, websocket: WebSocket) -> str:
        """Generate with PyTorch backend"""
        try:
            import torch
            
            input_data = tokenizer(system_prompt, return_tensors="pt", truncation=True, max_length=512)
            
            if hasattr(model, 'device'):
                input_data = {k: v.to(model.device) for k, v in input_data.items()}
            
            generation_config = {
                "max_new_tokens": 100,
                "do_sample": True,
                "temperature": 0.7,
                "pad_token_id": tokenizer.eos_token_id or 0,
                "no_repeat_ngram_size": 3,
                "early_stopping": True
            }
            
            with torch.no_grad():
                output_tokens = model.generate(**input_data, **generation_config)
            
            full_response = tokenizer.decode(output_tokens[0], skip_special_tokens=True)
            
            # Extract assistant response
            if "AIDE:" in full_response:
                assistant_response = full_response.split("AIDE:")[-1].strip()
            else:
                assistant_response = full_response[len(system_prompt):].strip()
            
            # Cap response length
            assistant_response = assistant_response[:200]
            
            # Stream character by character
            for char in assistant_response:
                await websocket.send_json({
                    "type": "stream_chunk",
                    "chunk": char,
                    "complete": False
                })
                await asyncio.sleep(0.03)
            
            await websocket.send_json({
                "type": "stream_complete",
                "full_response": assistant_response,
                "complete": True
            })
            
            return assistant_response
            
        except Exception as e:
            error_msg = f"PyTorch generation failed: {str(e)}"
            logger.error(error_msg)
            
            await websocket.send_json({
                "type": "stream_error",
                "error": error_msg,
                "complete": True
            })
            
            return error_msg
    
    async def _process_tool_calls(self, response_text: str, original_message: str, 
                                context: dict, websocket: WebSocket) -> Tuple[str, List[str], List[dict]]:
        """
        ENHANCED tool processing with better pattern matching
        Extracted from monolithic api.py
        """
        try:
            # Enhanced tool pattern matching
            tool_patterns = [
                re.compile(r"TOOL\\[([\\w]+)\\]", re.I),
                re.compile(r"TOOL::([\\w]+)\\(", re.I),
                re.compile(r"TOOL:([\\w]+)", re.I),
            ]
            
            tools_found = []
            for pattern in tool_patterns:
                tools_found.extend(pattern.findall(response_text))
            
            # Also check original message for implicit tool requests
            implicit_tools = self.tool_service.detect_implicit_tools(original_message)
            tools_found.extend(implicit_tools)
            
            used_tools = []
            actions = []
            
            for tool_name in set(tools_found):
                logger.info(f"🔧 Processing tool: {tool_name}")
                
                try:
                    # Extract arguments for this tool
                    args = self.tool_service.extract_tool_arguments(original_message, tool_name, context)
                    
                    # Execute tool
                    result = await self.tool_service.execute_tool(tool_name, args)
                    
                    if result.get("success", False):
                        used_tools.append(tool_name)
                        actions.append({
                            "type": "tool_execution",
                            "tool": tool_name,
                            "args": args,
                            "result": result
                        })
                        
                        # Send result to WebSocket
                        await websocket.send_json({
                            "type": "tool_result",
                            "tool": tool_name,
                            "args": args,
                            "result": result
                        })
                        
                        # Append result to response
                        response_text += f"\\n\\n**{tool_name} Result:**\\n{json.dumps(result, indent=2)}"
                        
                        # Save tool usage to memory
                        await self.memory_service.save_tool_usage(
                            tool_name=tool_name,
                            tool_args=args,
                            tool_result=result,
                            context=context
                        )
                    else:
                        error_msg = result.get("error", "Tool execution failed")
                        response_text += f"\\n\\n*{tool_name} error: {error_msg}*"
                        logger.warning(f"Tool {tool_name} failed: {error_msg}")
                
                except Exception as e:
                    error_msg = f"{tool_name} error: {str(e)}"
                    response_text += f"\\n\\n*{error_msg}*"
                    logger.error(f"Tool execution failed: {e}")
            
            return response_text, used_tools, actions
            
        except Exception as e:
            logger.error(f"Tool processing failed: {e}")
            return response_text, [], []

# Global streaming service instance
streaming_service = StreamingService()