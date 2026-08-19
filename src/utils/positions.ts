/** It takes position and limit it form 0 to document length*/
export const getClampedPosition = (position: number, docLength: number) => Math.max(0, Math.min(position, docLength));
