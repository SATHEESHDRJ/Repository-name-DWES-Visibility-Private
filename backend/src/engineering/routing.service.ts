import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { duct_nodes, terminal_geometries } from '@prisma/client';

export interface RoutePoint {
  x: number;
  y: number;
  z: number;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates the shortest path between two terminals using A* through the duct graph.
   * If a route cannot be found, returns null.
   */
  async calculateCableRoute(
    panelModelId: number,
    sourceTerminal: terminal_geometries,
    destinationTerminal: terminal_geometries,
  ): Promise<{ nodes: RoutePoint[]; length: number } | null> {
    const nodes = await this.prisma.duct_nodes.findMany({
      where: { panel_model_id: panelModelId },
    });
    
    const segments = await this.prisma.duct_segments.findMany({
      where: { panel_model_id: panelModelId, enabled: true },
    });

    if (nodes.length === 0 || segments.length === 0) {
      return null;
    }

    // Graph setup
    const graph = new Map<number, { targetId: number; length: number }[]>();
    for (const node of nodes) {
      graph.set(node.id, []);
    }
    
    for (const seg of segments) {
      if (graph.has(seg.source_node_id) && graph.has(seg.destination_node_id)) {
        // Assume bi-directional unless specifically restricted
        if (!seg.direction || seg.direction === 'bidirectional' || seg.direction === 'forward') {
          graph.get(seg.source_node_id)!.push({ targetId: seg.destination_node_id, length: seg.length });
        }
        if (!seg.direction || seg.direction === 'bidirectional' || seg.direction === 'reverse') {
          graph.get(seg.destination_node_id)!.push({ targetId: seg.source_node_id, length: seg.length });
        }
      }
    }

    // Find nearest entry node for source and dest
    const startNode = this.findNearestNode(sourceTerminal, nodes);
    const endNode = this.findNearestNode(destinationTerminal, nodes);

    if (!startNode || !endNode) return null;

    // A* algorithm
    const openSet = new Set<number>([startNode.id]);
    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>();
    const fScore = new Map<number, number>();

    for (const node of nodes) {
      gScore.set(node.id, Infinity);
      fScore.set(node.id, Infinity);
    }

    gScore.set(startNode.id, 0);
    fScore.set(startNode.id, this.heuristic(startNode, endNode));

    while (openSet.size > 0) {
      let currentId = -1;
      let minFScore = Infinity;
      for (const id of openSet) {
        const score = fScore.get(id)!;
        if (score < minFScore) {
          minFScore = score;
          currentId = id;
        }
      }

      if (currentId === endNode.id) {
        return this.reconstructPath(cameFrom, currentId, nodes, sourceTerminal, destinationTerminal);
      }

      openSet.delete(currentId);

      const neighbors = graph.get(currentId) || [];
      for (const neighbor of neighbors) {
        const tentativeGScore = gScore.get(currentId)! + neighbor.length;
        if (tentativeGScore < (gScore.get(neighbor.targetId) ?? Infinity)) {
          cameFrom.set(neighbor.targetId, currentId);
          gScore.set(neighbor.targetId, tentativeGScore);
          
          const neighborNode = nodes.find(n => n.id === neighbor.targetId)!;
          fScore.set(neighbor.targetId, tentativeGScore + this.heuristic(neighborNode, endNode));
          
          openSet.add(neighbor.targetId);
        }
      }
    }

    return null; // No path found
  }

  private findNearestNode(point: RoutePoint, nodes: duct_nodes[]): duct_nodes | null {
    let nearest: duct_nodes | null = null;
    let minDistance = Infinity;
    
    for (const node of nodes) {
      const dist = this.heuristic(point, node);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = node;
      }
    }
    
    return nearest;
  }

  private heuristic(a: RoutePoint, b: RoutePoint): number {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2) +
      Math.pow(a.z - b.z, 2)
    );
  }

  private reconstructPath(
    cameFrom: Map<number, number>,
    current: number,
    nodes: duct_nodes[],
    source: RoutePoint,
    dest: RoutePoint
  ): { nodes: RoutePoint[]; length: number } {
    const pathIds = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current)!;
      pathIds.unshift(current);
    }
    
    const routeNodes: RoutePoint[] = [
      source,
      ...pathIds.map(id => {
        const n = nodes.find(x => x.id === id)!;
        return { x: n.x, y: n.y, z: n.z };
      }),
      dest
    ];

    let length = 0;
    for (let i = 0; i < routeNodes.length - 1; i++) {
      length += this.heuristic(routeNodes[i], routeNodes[i+1]);
    }

    return { nodes: routeNodes, length };
  }
}
