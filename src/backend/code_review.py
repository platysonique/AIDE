import ast
import re
from typing import List, Dict, Any

def _is_var_used(var: str, code: str, start_line: int) -> bool:
    pattern = re.compile(rf"\b{re.escape(var)}\b")
    lines_after = "\n".join(code.splitlines()[start_line - 1 :])
    return bool(pattern.search(lines_after))

def review_code(payload: Dict[str, Any]) -> Dict[str, Any]:
    files: List[Dict[str, str]] = payload.get("files", [])
    results: List[Dict[str, Any]] = []

    for file_entry in files:
        filename = file_entry.get("filename", "<unknown>")
        code     = file_entry.get("content",  "")
        try:
            tree = ast.parse(code, filename)
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef) and len(node.body) > 50:
                    results.append({
                        "file": filename,
                        "line": node.lineno,
                        "issue": f"Function '{node.name}' is too long/complex.",
                        "suggestion": "Refactor into smaller functions."
                    })
                elif isinstance(node, ast.Assign) and node.targets:
                    target = node.targets[-1]
                    if isinstance(target, ast.Name):
                        var_name = target.id
                        start_line = getattr(node, "end_lineno", node.lineno)
                        if not _is_var_used(var_name, code, start_line):
                            results.append({
                                "file": filename,
                                "line": node.lineno,
                                "issue": f"Variable '{var_name}' assigned but never used.",
                                "suggestion": "Remove assignment or use the variable."
                            })
            if "\t" in code:
                results.append({
                    "file": filename,
                    "line": 1,
                    "issue": "Tab character detected in indentation.",
                    "suggestion": "Convert tabs to spaces."
                })
        except Exception as exc:
            results.append({
                "file": filename,
                "line": 1,
                "issue": "Could not parse file.",
                "suggestion": str(exc)
            })

    if not results:
        results.append({
            "file": filename,
            "line": 0,
            "issue": "No issues found!",
            "suggestion": ""
        })

    return {"results": results}
