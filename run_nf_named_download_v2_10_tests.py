from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
for command in (
    ["node", "--check", "nf-named-download.user.js"],
    ["node", "test_nf_named_download_v2_10.js"],
):
    subprocess.run(command, cwd=root, check=True, timeout=25)
