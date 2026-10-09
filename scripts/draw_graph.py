import math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import networkx as nx

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

EDGES = [
    ('A', 'B'), ('A', 'C'), ('A', 'D'), ('A', 'E'), ('A', 'H'),
    ('B', 'D'), ('B', 'F'),
    ('E', 'G'), ('F', 'G'), ('G', 'J'),
    ('I', 'J'),
]

KM = {
    ('A', 'B'): 0.037, ('A', 'C'): 0.101, ('A', 'D'): 0.108,
    ('A', 'E'): 0.060, ('A', 'H'): 0.086, ('B', 'D'): 0.085,
    ('B', 'F'): 0.111, ('E', 'G'): 0.097, ('F', 'G'): 0.132,
    ('G', 'J'): 0.102, ('I', 'J'): 0.077,
}

G = nx.MultiGraph()
G.add_nodes_from(NODES)

for a, b in EDGES:
    G.add_edge(a, b, weight=KM[(a, b)])

# parallel pair H-I: two distinct roads
G.add_edge('H', 'I', weight=0.073, road='road 1')
G.add_edge('H', 'I', weight=0.073, road='road 2')

# lat/lon -> plot coords, flip lon so east is right
pos = {n: (lon, lat) for n, (lat, lon) in NODES.items()}

fig, ax = plt.subplots(figsize=(13, 11))

# draw simple edges
simple = [(a, b) for a, b in EDGES]
nx.draw_networkx_edges(G, pos, edgelist=simple, ax=ax, width=2.0,
                       edge_color='#555555')

# draw the two parallel H-I edges as offset arcs
for i, rad in enumerate((0.28, -0.28)):
    nx.draw_networkx_edges(
        G, pos, edgelist=[('H', 'I')], ax=ax, width=2.4,
        edge_color='#c0392b', connectionstyle=f'arc3,rad={rad}',
    )

nx.draw_networkx_nodes(G, pos, ax=ax, node_size=2600,
                       node_color='#ffffff', edgecolors='#111111', linewidths=2.4)
nx.draw_networkx_labels(G, pos, ax=ax, font_size=17, font_weight='bold')

# edge weight labels
for a, b in EDGES:
    x = (pos[a][0] + pos[b][0]) / 2
    y = (pos[a][1] + pos[b][1]) / 2
    ax.text(x, y, f'{KM[(a, b)]:.3f}', fontsize=9, color='#333333',
            ha='center', va='center',
            bbox=dict(boxstyle='round,pad=0.15', fc='white', ec='none', alpha=0.85))

# label the parallel edges, next to their actual arcs
xs = [p[0] for p in pos.values()]
ys = [p[1] for p in pos.values()]
spanx = max(xs) - min(xs)
spany = max(ys) - min(ys)

mx = (pos['H'][0] + pos['I'][0]) / 2
my = (pos['H'][1] + pos['I'][1]) / 2
ax.text(mx - spanx * 0.045, my, 'road 1\n0.073', fontsize=9.5, color='#c0392b',
        ha='right', va='center', fontweight='bold')
ax.text(mx + spanx * 0.045, my, 'road 2\n0.073', fontsize=9.5, color='#c0392b',
        ha='left', va='center', fontweight='bold')

ax.set_title('Hometown Map — Undirected Multigraph', fontsize=15, pad=14)
ax.set_xlabel('longitude')
ax.set_ylabel('latitude')
ax.margins(0.12)
ax.grid(alpha=0.18, linestyle=':')
fig.tight_layout()
fig.savefig('/home/sifat/sable_output/assets/q2_graph.png', dpi=190)

print('nodes:', G.number_of_nodes())
print('edges:', G.number_of_edges())
print('degrees:')
for n in sorted(G.nodes()):
    print(f'  {n}: {G.degree(n)}')
print()
print('sum deg =', sum(d for _, d in G.degree()), '= 2|E| =', 2 * G.number_of_edges())
print('image -> /home/sifat/sable_output/assets/q2_graph.png')
