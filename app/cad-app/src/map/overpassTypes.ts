export interface OsmNode {
  type: 'node'
  id: number
  lat: number
  lon: number
  tags?: Record<string, string>
}

export interface OsmWayGeomPoint {
  lat: number
  lon: number
}

export interface OsmWay {
  type: 'way'
  id: number
  nodes?: number[]
  geometry?: OsmWayGeomPoint[]
  tags?: Record<string, string>
}

export interface OsmRelationMember {
  type: 'node' | 'way' | 'relation'
  ref: number
  role: string
  geometry?: OsmWayGeomPoint[]
}

export interface OsmRelation {
  type: 'relation'
  id: number
  members?: OsmRelationMember[]
  tags?: Record<string, string>
}

export type OsmElement = OsmNode | OsmWay | OsmRelation

export interface OverpassResponse {
  version?: number
  generator?: string
  elements: OsmElement[]
}
