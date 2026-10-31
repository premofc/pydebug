from pathlib import Path
import json
import tempfile
from pydebug.server.app import (
    extract_function_implementation,
    find_function_references,
    PyDebugHandler,
    get_session_manager,
)


def test_extract_function_implementation():
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "demo.py"
        p.write_text(
            """def add(a: int, b: int) -> int:
    '''Sums two numbers.'''
    return a + b

class Calculator:
    def multiply(self, x, y):
        return x * y
""",
            encoding="utf-8",
        )

        res = extract_function_implementation(str(p), "add")
        assert res is not None
        assert res["name"] == "add"
        assert res["start_line"] == 1
        assert "def add(a: int, b: int)" in res["code"]
        assert "return a + b" in res["code"]
        assert res["is_async"] is False

        # Class method
        res_method = extract_function_implementation(str(p), "Calculator.multiply")
        assert res_method is not None
        assert res_method["class_name"] == "Calculator"
        assert "def multiply(self, x, y):" in res_method["code"]

        # Missing function
        assert extract_function_implementation(str(p), "nonexistent") is None


def test_find_function_references(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        file1 = tmp_path / "calc.py"
        file1.write_text(
            """def compute(x):
    return x * 2
""",
            encoding="utf-8",
        )

        file2 = tmp_path / "main.py"
        file2.write_text(
            """from calc import compute

def run():
    val = compute(10)
    return val
""",
            encoding="utf-8",
        )

        # Monkeypatch scan_project_python_files to return our temp files
        monkeypatch.setattr("pydebug.server.app.scan_project_python_files", lambda: [file1, file2])

        refs = find_function_references("compute", str(file1))
        assert len(refs) == 1
        ref = refs[0]
        assert ref["line"] == 4
        assert "compute(10)" in ref["snippet"]
        assert "run()" in ref["caller_context"]
        assert ref["is_internal"] is False

