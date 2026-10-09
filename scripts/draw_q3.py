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
    'B': (23.788087, 90.427545),
    'A': (23.788052, 90.427888),
    'H': (23.788038, 90.428666),
    'D': (23.787792, 90.426949),
    'C': (23.787537, 90.428408),
}
pos = {n: (lon, lat) for n, (lat, lon) in NODES.items()}

ESP = '#8B4513'
COLD = '#3D85C6'
RED = '#E01B24'

# result of 2-colouring from A
color = {
    'A': ESP,  'B': COLD, 'C': COLD, 'D': COLD, 'E': COLD,
    'F': ESP,  'G': ESP,  'H': COLD, 'I': ESP,  'J': COLD,
}

G = nx.Graph()
G.add_nodes_from(NODES)

OK_EDGES = [('A','B'),('A','C'),('A','E'),('A','H'),('B','F'),
            ('E','G'),('G','J'),('H','I'),('I','J')]

# both edges that end up same-coloured
BAD = [('A','D'), ('B','D'), ('F','G')]

fig, ax = plt.subplots(figsize=(15, 11.5))

nx.draw_networkx_edges(G, pos, edgelist=OK_EDGES, ax=ax, width=2.2, edge_color='#666666')
nx.draw_networkx_edges(G, pos, edgelist=[('A','D')], ax=ax, width=2.2, edge_color='#666666')
nx.draw_networkx_edges(G, pos, edgelist=[('B','D'), ('F','G')], ax=ax, width=5.0,
                       edge_color=RED, style='dashed')

nl = list(NODES.keys())
nsz = [3400 if n in ('A','B','D','F','G') else 2600 for n in nl]
lw = [4.0 if n in ('A','B','D','F','G') else 2.4 for n in nl]

nx.draw_networkx_nodes(G, pos, nodelist=nl, ax=ax, node_size=nsz,
                       node_color=[color[n] for n in nl],
                       edgecolors='#111111', linewidths=lw)
nx.draw_networkx_labels(G, pos, ax=ax, font_size=18, font_weight='bold', font_color='white')

# label the two conflicting edges, each anchored to its own midpoint
mx1 = (pos['B'][0] + pos['D'][0]) / 2
my1 = (pos['B'][1] + pos['D'][1]) / 2
ax.text(mx1 - 0.00014, my1 + 0.00012, 'B & D same colour',
        fontsize=10.5, color=RED, fontweight='bold', ha='right', va='bottom')

mx2 = (pos['F'][0] + pos['G'][0]) / 2
my2 = (pos['F'][1] + pos['G'][1]) / 2
ax.text(mx2, my2 + 0.00014, 'F & G same colour',
        fontsize=10.5, color=RED, fontweight='bold', ha='center', va='bottom')

# highlight just the triangle A-B-D, sized to actually fit it
tri_x = [pos['A'][0], pos['B'][0], pos['D'][0], pos['A'][0]]
tri_y = [pos['A'][1], pos['B'][1], pos['D'][1], pos['A'][1]]
ax.plot(tri_x, tri_y, color=RED, lw=2.6, ls=':', zorder=1)
ax.text(pos['D'][0] + 0.00010, pos['D'][1] - 0.00008,
        'odd cycle\nA-B-D-A', fontsize=11, color=RED,
        fontweight='bold', ha='right', va='top')

legend = [
    Patch(facecolor=ESP, edgecolor='#111', label='Espresso Bar'),
    Patch(facecolor=COLD, edgecolor='#111', label='Cold Brew Corner'),
    Line2D([0], [0], color=RED, lw=4, ls='--', label='road, same colour both ends'),
]
ax.legend(handles=legend, loc='upper left', fontsize=12, framealpha=0.95)

ax.set_title('Q3 - 2-Colouring Fails: Graph is NOT Bipartite', fontsize=17, pad=16)
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
fig.savefig('/home/sifat/sable_output/assets/q3_coloring.png', dpi=190)
print('saved q3_coloring.png')
print('conflicts: B-D (both Cold Brew), F-G (both Espresso)')
