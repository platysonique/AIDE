import traceback

def surface_errors(payload):
    errors = []
    logs = payload.get('logs', '')
    if "Traceback (most recent call last):" in logs:
        tb_lines = logs.split('\n')
        for i, line in enumerate(tb_lines):
            if line.strip().startswith("File"):
                parts = line.strip().split(',')
                fname = parts[^0].split('"')[-2] if '"' in parts[^0] else parts[^0]
                lineno = parts[^1].strip().split(' ')[-1]
                err_line = tb_lines[i+1].strip() if i+1 < len(tb_lines) else ""
                errors.append({
                    "type": "Exception",
                    "location": f"{fname}:{lineno}",
                    "details": err_line
                })
        for line in reversed(tb_lines):
            if line and ("Error" in line or "Exception" in line):
                errors[-1]["details"] += f" ({line.strip()})"
                break
    if not errors and "error" in logs.lower():
        errors.append({"type": "Generic error", "location": "", "details": "See logs."})
    next_steps = [
        "Would you like a step-by-step walkthrough to address this error?",
        "Should I search for similar issues or suggest a custom fix?"
    ]
    return {"errors": errors, "next_steps": next_steps}

def debug_step(payload):
    last_error = payload.get("last_error", {})
    guidance   = payload.get("guidance", "")
    if not last_error:
        return {"suggestion": "No specific error provided for stepwise debug."}
    if guidance == "explain":
        return {"suggestion":
            f"{last_error.get('type','Error')} at {last_error.get('location')}: "
            f"{last_error.get('details')} -- Common causes include syntax mistakes or undefined variables."}
    elif guidance == "suggest":
        return {"suggestion": "Check for recent changes in the reported file and line. Add print/logging statements before the error occurs."}
    else:
        return {"suggestion": "Please clarify if you'd like an explanation or a fix suggestion."}
