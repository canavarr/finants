import re

with open('questions.js', 'r') as f:
    content = f.read()

# Naive parser: Split by "id: '" to get blocks
# This assumes "id:" is the start of a question block
blocks = content.split("id: '")

print(f"Found {len(blocks)-1} potential blocks")

issues = 0

for block in blocks[1:]: # Skip preamble
    # Extract ID
    id_match = re.match(r"([^']+)'", block)
    if not id_match: continue
    qid = id_match.group(1)

    # Check type
    type_match = re.search(r"type:\s*'([^']+)'", block)
    qtype = type_match.group(1) if type_match else "unknown"

    # Check for matches/options
    has_matches = "matches: [" in block
    has_options = "options: [" in block

    if qtype == 'input' and (has_matches or has_options):
        print(f"[MISMATCH] {qid}: type='input' but has matches/options")
        issues += 1
    
    if qtype == 'dropdown' and not (has_matches or has_options):
        # weak check, might just use options
        print(f"[WARNING] {qid}: type='dropdown' but missing matches/options keyword")
        # issues += 1 # optional warning

if issues == 0:
    print("No mismatches found.")
