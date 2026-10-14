// A still from a Mux video, for grids.
export function muxThumbnailUrl(playbackId: string, width: number) {
  return `https://image.mux.com/${playbackId}/thumbnail.webp?width=${width}`
}
