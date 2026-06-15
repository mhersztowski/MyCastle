export type MapNodeType = 'tile-layer' | 'marker' | 'polygon' | 'polyline' | 'circle' | 'group'

export interface MapNode {
  id: string
  name: string
  type: MapNodeType
  visible: boolean
  children?: MapNode[]
  // tile-layer
  url?: string
  attribution?: string
  opacity?: number
  // spatial (marker / circle)
  lat?: number
  lng?: number
  // polygon / polyline
  positions?: [number, number][]
  // circle
  radius?: number
  // popup
  popup?: string
  // style
  color?: string
  fillOpacity?: number
  weight?: number
}
