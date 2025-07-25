---
base_model:
- deepseek-ai/DeepSeek-R1-Distill-Qwen-7B
library_name: transformers
tags:
- abliterated
- uncensored
---

# huihui-ai/DeepSeek-R1-Distill-Qwen-7B-abliterated


This is an uncensored version of [deepseek-ai/DeepSeek-R1-Distill-Qwen-7B](https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B) created with abliteration (see [remove-refusals-with-transformers](https://github.com/Sumandora/remove-refusals-with-transformers) to know more about it).  
This is a crude, proof-of-concept implementation to remove refusals from an LLM model without using TransformerLens.

**Important Note** The 7B model performs slightly worse and may experience some issues with encoding, such as occasional use of wrong characters.

## Use with ollama

You can use [huihui_ai/deepseek-r1-abliterated](https://ollama.com/huihui_ai/deepseek-r1-abliterated) directly
```
ollama run huihui_ai/deepseek-r1-abliterated:7b
```

