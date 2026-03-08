import sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('\\`', '`').replace('\\${', '${')
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    f.write(c)
