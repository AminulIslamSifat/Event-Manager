import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import networkx as nx
from matplotlib.lines import Line2D
from matplotlib.patches import Patch

NODES = {
    'G': (23.789103, 90.428049),
    'F': (23.788995, 90.427394),
    'J': (23.788956, 90.428972),
    'I': (23.788607, 90.428505),
    'E': (23.788327, 90.428103),
    'A': (23.788052, 90.427888),
    'H': (23.788038, 90.428666),
    'D': (23.787792, 90.426949),
    'C': (23.787537, 90.428408),
}
pos = {n: (lon, lat) for n, (lat, lon) in NODES.items()}

ESP = '#8B4513'
COLD = '#3D85C6'

# 2-colouring after removing B
color = {
    'A': ESP, 'C': COLD, 'D': COLD, 'E': COLD,
    'F': COLD, 'G': ESP, 'H': COLD, 'I': ESP, 'J': COLD,
}

EDGES = [('A','C'),('A','D'),('A','E'),('A','H'),
         ('E','G'),('F','G'),('G','J'),('H','I'),('I','J')]

# verify: no edge may join two same colours
bad = [(u, v) for u, v in EDGES if color[u] == color[v]]

G = nx.Graph()
G.add_nodes_from(NODES)

fig, ax = plt.subplots(figsize=(14, 10))

nx.draw_networkx_edges(G, pos, edgelist=EDGES, ax=ax, width=2.4, edge_color='#6a6a6a')

nl = list(NODES.keys())
nsz = [3600 if n == 'A' else 2600 for n in nl]
lw = [4.0 if n == 'A' else 2.2 for n in nl]

nx.draw_networkx_nodes(G, pos, nodelist=nl, ax=ax, node_size=nsz,
                       node_color=[color[n] for n in nl],
                       edgecolors='#111111', linewidths=lw)
nx.draw_networkx_labels(G, pos, ax=ax, font_size=17, font_weight='bold',
                        font_color='white')

# show where B used to be, crossed out
gx, gy = 90.427545, 23.788087
ax.plot(gx, gy, marker='x', markersize=26, markeredgewidth=5,
        color='#B00020', zorder=5)
ax.text(gx, gy + 0.00034, 'B', fontsize=17, fontweight='bold',
        color='#B00020', ha='center', va='bottom')
ax.text(gx, gy - 0.00034, 'skipped', fontsize=11, fontweight='bold',
        color='#B00020', ha='center', va='top')

legend = [
    Patch(facecolor=ESP, edgecolor='#111', label='Espresso Bar'),
    Patch(facecolor=COLD, edgecolor='#111', label='Cold Brew Corner'),
    Line2D([0], [0], marker='x', color='#B00020', lw=0, markersize=13,
           markeredgewidth=3, label='checkpoint skipped'),
]
ax.legend(handles=legend, loc='upper left', fontsize=12, framealpha=0.95)

status = 'VALID 2-COLOURING' if not bad else 'INVALID: ' + str(bad)
ax.set_title('Q3 - After Removing Checkpoint B: %s' % status,
             fontsize=17, pad=16, color='#1a7f37' if not bad else '#B00020')
ax.set_xlabel('longitude')
ax.set_ylabel('latitude')

xs = [p[0] for p in pos.values()]
ys = [p[1] for p in pos.values()]
px = (max(xs) - min(xs)) * 0.22
py = (max(ys) - min(ys)) * 0.22
ax.set_xlim(min(xs) - px, max(xs) + px)
ax.set_ylim(min(ys) - py, max(ys) + py)
ax.set_aspect('equal', adjustable='box')
ax.grid(alpha=0.15, linestyle=':')
fig.tight_layout()
fig.savefig('/home/sifat/sable_output/assets/q3_after_removal.png', dpi=190)

print('nodes:', len(NODES), 'edges:', len(EDGES))
print('violations:', bad if bad else 'NONE - valid')
print('Espresso :', sorted(n for n in NODES if color[n] == ESP))
print('Cold Brew:', sorted(n for n in NODES if color[n] == COLD))
print('saved q3_after_removal.png')
