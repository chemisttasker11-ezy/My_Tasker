"""Prevent accidental staging->production cross-routing on the shared OVH gateway.

Executed in CI without secrets or a running production service.
"""
from pathlib import Path
import re
import sys

ROOT=Path(__file__).resolve().parent.parent
CASES=(
    ("deploy/shared-nginx-staging-location.conf","mytasker_backend_staging","mytasker_backend_prod"),
    ("deploy/shared-nginx-location.conf","mytasker_backend_prod","mytasker_backend_staging"),
)
errors=[]
for relative,expected,forbidden in CASES:
    path=ROOT/relative
    data=path.read_text(encoding="utf-8")
    targets=re.findall(r"(?m)^\s*proxy_pass\s+http://([a-zA-Z0-9_-]+):8000\s*;",data)
    if targets != [expected]:
        errors.append(f"{relative}: expected exactly {expected}:8000, got {targets}")
    if forbidden in data:
        errors.append(f"{relative}: references the opposite environment {forbidden}")
for relative,expected in (("docker-compose.staging.yml","mytasker_backend_staging"),
                          ("docker-compose.prod.yml","mytasker_backend_prod")):
    source=(ROOT/relative).read_text(encoding="utf-8")
    if f"container_name: {expected}" not in source:
        errors.append(f"{relative}: missing required isolated container {expected}")
    other="mytasker_backend_prod" if expected.endswith("_staging") else "mytasker_backend_staging"
    if other in source:
        errors.append(f"{relative}: references {other}")
if errors:
    print("\n".join(errors),file=sys.stderr)
    sys.exit(1)
print("Staging/prod Nginx upstreams and Compose container isolation verified.")
