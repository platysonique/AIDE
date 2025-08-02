# File: src/backend/tools/analyze_codebase.py

from pathlib import Path
import os
import json
import subprocess
from typing import Dict, List, Any

@tool("analyze_codebase", "Analyze the entire codebase structure and provide insights", {
    "path": {"type": "string", "description": "Path to analyze (defaults to current workspace)"}
})
def analyze_codebase(path: str = "."):
    """
    Analyze codebase structure, detect patterns, and provide insights
    """
    try:
        base_path = Path(path)
        if not base_path.exists():
            return {"error": f"Path does not exist: {path}"}
        
        if not base_path.is_dir():
            return {"error": f"Path is not a directory: {path}"}

        analysis = {
            "path": str(base_path.resolve()),
            "structure": {},
            "files": {
                "total": 0,
                "by_extension": {},
                "largest": [],
                "recent": []
            },
            "languages": {},
            "git_info": {},
            "dependencies": {},
            "insights": []
        }

        # Analyze directory structure
        analysis["structure"] = _analyze_directory_structure(base_path)
        
        # Analyze files
        analysis["files"] = _analyze_files(base_path)
        
        # Detect programming languages
        analysis["languages"] = _detect_languages(base_path)
        
        # Git analysis
        analysis["git_info"] = _analyze_git_repo(base_path)
        
        # Dependency analysis
        analysis["dependencies"] = _analyze_dependencies(base_path)
        
        # Generate insights
        analysis["insights"] = _generate_insights(analysis)

        return analysis

    except Exception as e:
        return {"error": f"Codebase analysis failed: {str(e)}"}

def _analyze_directory_structure(base_path: Path) -> Dict[str, Any]:
    """Analyze directory structure"""
    structure = {
        "directories": [],
        "total_dirs": 0,
        "max_depth": 0,
        "common_patterns": []
    }

    try:
        # Common directories to identify project type
        common_dirs = {
            "src", "lib", "app", "components", "services", "utils", "models",
            "tests", "test", "__tests__", "spec", "docs", "documentation",
            "config", "scripts", "build", "dist", "public", "assets",
            "node_modules", ".git", ".vscode", "venv", "env"
        }

        found_dirs = set()
        max_depth = 0
        total_dirs = 0

        for root, dirs, files in os.walk(base_path):
            depth = str(Path(root)).count(os.sep) - str(base_path).count(os.sep)
            max_depth = max(max_depth, depth)
            total_dirs += len(dirs)

            # Skip deep nested directories to avoid performance issues
            if depth > 5:
                dirs[:] = []
                continue

            for dir_name in dirs:
                if dir_name in common_dirs:
                    found_dirs.add(dir_name)
                    structure["directories"].append({
                        "name": dir_name,
                        "path": str(Path(root) / dir_name),
                        "depth": depth + 1
                    })

        structure["total_dirs"] = total_dirs
        structure["max_depth"] = max_depth
        structure["common_patterns"] = list(found_dirs)

    except Exception as e:
        structure["error"] = str(e)

    return structure

def _analyze_files(base_path: Path) -> Dict[str, Any]:
    """Analyze files in the codebase"""
    files_info = {
        "total": 0,
        "by_extension": {},
        "largest": [],
        "recent": [],
        "total_size": 0
    }

    try:
        all_files = []
        
        for root, dirs, files in os.walk(base_path):
            # Skip common ignore directories
            dirs[:] = [d for d in dirs if d not in {'.git', 'node_modules', '__pycache__', '.venv', 'venv'}]
            
            for file in files:
                file_path = Path(root) / file
                try:
                    stat = file_path.stat()
                    ext = file_path.suffix.lower()
                    
                    file_info = {
                        "name": file,
                        "path": str(file_path),
                        "size": stat.st_size,
                        "modified": stat.st_mtime,
                        "extension": ext
                    }

                    all_files.append(file_info)
                    files_info["total"] += 1
                    files_info["total_size"] += stat.st_size

                    # Track extensions
                    if ext:
                        files_info["by_extension"][ext] = files_info["by_extension"].get(ext, 0) + 1

                except (OSError, PermissionError):
                    continue

        # Sort by size (largest files)
        files_info["largest"] = sorted(all_files, key=lambda x: x["size"], reverse=True)[:10]
        
        # Sort by modification time (most recent)
        files_info["recent"] = sorted(all_files, key=lambda x: x["modified"], reverse=True)[:10]

        # Clean up paths for privacy
        for file_list in [files_info["largest"], files_info["recent"]]:
            for file_info in file_list:
                file_info["path"] = str(Path(file_info["path"]).relative_to(base_path))

    except Exception as e:
        files_info["error"] = str(e)

    return files_info

def _detect_languages(base_path: Path) -> Dict[str, Any]:
    """Detect programming languages used"""
    languages = {
        "detected": {},
        "primary": None,
        "config_files": []
    }

    # Language detection based on extensions
    language_map = {
        ".py": "Python",
        ".js": "JavaScript", 
        ".ts": "TypeScript",
        ".jsx": "React",
        ".tsx": "React TypeScript",
        ".java": "Java",
        ".cpp": "C++",
        ".c": "C",
        ".cs": "C#",
        ".php": "PHP",
        ".rb": "Ruby",
        ".go": "Go",
        ".rs": "Rust",
        ".swift": "Swift",
        ".kt": "Kotlin",
        ".dart": "Dart",
        ".html": "HTML",
        ".css": "CSS",
        ".scss": "SCSS",
        ".sass": "Sass",
        ".sql": "SQL",
        ".sh": "Shell",
        ".yml": "YAML",
        ".yaml": "YAML",
        ".json": "JSON",
        ".xml": "XML",
        ".md": "Markdown"
    }

    config_files = {
        "package.json": "Node.js/npm",
        "requirements.txt": "Python pip", 
        "Pipfile": "Python pipenv",
        "pyproject.toml": "Python Poetry",
        "Cargo.toml": "Rust",
        "go.mod": "Go modules",
        "pom.xml": "Java Maven",
        "build.gradle": "Java Gradle",
        "composer.json": "PHP Composer",
        "Gemfile": "Ruby Bundler"
    }

    try:
        # Count files by language
        for root, dirs, files in os.walk(base_path):
            dirs[:] = [d for d in dirs if d not in {'.git', 'node_modules', '__pycache__'}]
            
            for file in files:
                ext = Path(file).suffix.lower()
                if ext in language_map:
                    lang = language_map[ext]
                    languages["detected"][lang] = languages["detected"].get(lang, 0) + 1

                # Check for config files
                if file in config_files:
                    languages["config_files"].append({
                        "file": file,
                        "type": config_files[file],
                        "path": str(Path(root) / file)
                    })

        # Determine primary language
        if languages["detected"]:
            primary = max(languages["detected"], key=languages["detected"].get)
            languages["primary"] = primary

    except Exception as e:
        languages["error"] = str(e)

    return languages

def _analyze_git_repo(base_path: Path) -> Dict[str, Any]:
    """Analyze git repository information"""
    git_info = {
        "is_repo": False,
        "branch": None,
        "commits": 0,
        "contributors": [],
        "status": {}
    }

    try:
        git_dir = base_path / ".git"
        if git_dir.exists():
            git_info["is_repo"] = True

            # Get current branch
            try:
                result = subprocess.run(
                    ["git", "branch", "--show-current"],
                    cwd=base_path,
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    git_info["branch"] = result.stdout.strip()
            except:
                pass

            # Get commit count
            try:
                result = subprocess.run(
                    ["git", "rev-list", "--count", "HEAD"],
                    cwd=base_path,
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    git_info["commits"] = int(result.stdout.strip())
            except:
                pass

            # Get contributors
            try:
                result = subprocess.run(
                    ["git", "shortlog", "-sn", "--all"],
                    cwd=base_path,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.returncode == 0:
                    contributors = []
                    for line in result.stdout.strip().split('\n')[:5]:  # Top 5
                        if line.strip():
                            parts = line.strip().split('\t')
                            if len(parts) == 2:
                                contributors.append({
                                    "commits": int(parts[0]),
                                    "name": parts[1]
                                })
                    git_info["contributors"] = contributors
            except:
                pass

    except Exception as e:
        git_info["error"] = str(e)

    return git_info

def _analyze_dependencies(base_path: Path) -> Dict[str, Any]:
    """Analyze project dependencies"""
    deps = {
        "package_managers": [],
        "dependencies": {},
        "dev_dependencies": {},
        "total_deps": 0
    }

    try:
        # Check package.json
        package_json = base_path / "package.json"
        if package_json.exists():
            try:
                with open(package_json, 'r') as f:
                    data = json.load(f)
                    deps["package_managers"].append("npm")
                    deps["dependencies"]["npm"] = data.get("dependencies", {})
                    deps["dev_dependencies"]["npm"] = data.get("devDependencies", {})
                    deps["total_deps"] += len(data.get("dependencies", {}))
                    deps["total_deps"] += len(data.get("devDependencies", {}))
            except:
                pass

        # Check requirements.txt
        requirements = base_path / "requirements.txt"
        if requirements.exists():
            try:
                deps["package_managers"].append("pip")
                with open(requirements, 'r') as f:
                    pip_deps = {}
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            pkg_name = line.split('=')[0].split('>')[0].split('<')[0].split('!')[0]
                            pip_deps[pkg_name] = line
                    deps["dependencies"]["pip"] = pip_deps
                    deps["total_deps"] += len(pip_deps)
            except:
                pass

        # Check Cargo.toml
        cargo_toml = base_path / "Cargo.toml"
        if cargo_toml.exists():
            deps["package_managers"].append("cargo")

        # Check go.mod
        go_mod = base_path / "go.mod"
        if go_mod.exists():
            deps["package_managers"].append("go modules")

        # Check pyproject.toml (Python Poetry)
        pyproject_toml = base_path / "pyproject.toml"
        if pyproject_toml.exists():
            deps["package_managers"].append("poetry")

        # Check pixi.toml (Your current setup!)
        pixi_toml = base_path / "pixi.toml"
        if pixi_toml.exists():
            deps["package_managers"].append("pixi")

    except Exception as e:
        deps["error"] = str(e)

    return deps

def _generate_insights(analysis: Dict[str, Any]) -> List[str]:
    """Generate insights based on analysis"""
    insights = []

    try:
        # Project type insights
        languages = analysis.get("languages", {})
        if languages.get("primary"):
            insights.append(f"Primary language: {languages['primary']}")

        # Structure insights
        structure = analysis.get("structure", {})
        common_patterns = structure.get("common_patterns", [])
        
        if "src" in common_patterns:
            insights.append("Well-organized project with src/ directory")
        if "tests" in common_patterns or "test" in common_patterns:
            insights.append("Project includes test directory")
        if "docs" in common_patterns:
            insights.append("Project includes documentation")

        # Size insights
        files = analysis.get("files", {})
        total_files = files.get("total", 0)
        total_size = files.get("total_size", 0)

        if total_files > 1000:
            insights.append("Large codebase with 1000+ files")
        elif total_files < 10:
            insights.append("Small project with few files")

        if total_size > 10 * 1024 * 1024:  # 10MB
            insights.append("Large project (>10MB)")

        # Git insights
        git_info = analysis.get("git_info", {})
        if git_info.get("is_repo"):
            commits = git_info.get("commits", 0)
            if commits > 100:
                insights.append(f"Active repository with {commits} commits")
            elif commits > 0:
                insights.append(f"Git repository with {commits} commits")

        # Dependency insights
        deps = analysis.get("dependencies", {})
        total_deps = deps.get("total_deps", 0)
        package_managers = deps.get("package_managers", [])
        
        if total_deps > 50:
            insights.append(f"Heavy dependency usage ({total_deps} packages)")
        elif total_deps > 0:
            insights.append(f"Uses {total_deps} external packages")

        if "pixi" in package_managers:
            insights.append("Uses Pixi for dependency management (modern Python)")

        # Language-specific insights
        detected_langs = languages.get("detected", {})
        if "Python" in detected_langs and "TypeScript" in detected_langs:
            insights.append("Full-stack project with Python backend and TypeScript frontend")
        
        if not insights:
            insights.append("Basic project structure detected")

    except Exception as e:
        insights.append(f"Insight generation error: {str(e)}")

    return insights
