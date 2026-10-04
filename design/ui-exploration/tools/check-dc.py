import re, json, sys, html
from html.parser import HTMLParser
VOID = {'meta','link','br','img','input','hr','area','base','col','embed','source','track','wbr'}
for f in sys.argv[1:]:
    s = open(f).read()
    errs = []
    if '<script src="./support.js"></script>' not in s: errs.append('support.js line')
    m = re.search(r"data-props='([^']*)'", s)
    try:
        props = json.loads(html.unescape(m.group(1)))
        ph = props['$preview']['height']
    except Exception as e:
        errs.append('data-props: %s' % e); ph = None
    rm = re.search(r'<div class="ss \{\{theme\}\}" style="width: 390px; height: (\d+)px', s)
    if not rm: errs.append('root div pattern')
    elif ph and int(rm.group(1)) != ph: errs.append('height %s vs preview %s' % (rm.group(1), ph))
    if re.search(r'style="\{\{', s): errs.append('whole-style hole')
    for st in re.findall(r'style="([^"]*)"', s):
        for h in re.findall(r'\{\{[^}]*\}\}', st):
            pass
    # tag balance on x-dc body
    body = s[s.find('<x-dc>'):s.find('</x-dc>')+7]
    stack = []
    class P(HTMLParser):
        def handle_starttag(self, tag, a):
            if tag not in VOID: stack.append((tag, self.getpos()))
        def handle_startendtag(self, tag, a):
            if tag not in VOID: errs.append('self-closed <%s> at %s' % (tag, self.getpos()))
        def handle_endtag(self, tag):
            if tag in VOID: return
            if stack and stack[-1][0] == tag: stack.pop()
            else: errs.append('mismatch </%s> at %s (open %s)' % (tag, self.getpos(), stack[-1] if stack else None))
    P().feed(body)
    if stack: errs.append('unclosed %s' % stack[-3:])
    holes = set(h.strip().split('.')[0] for h in re.findall(r'\{\{([^}]*)\}\}', body))
    print(f, ph, 'OK' if not errs else errs, 'holes:', ' '.join(sorted(holes)))
