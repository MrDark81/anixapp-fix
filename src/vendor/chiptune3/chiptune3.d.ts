/** Type declaration for the local vendored Chiptune worklet player. */
export class ChiptuneJsPlayer {
  constructor(config?: {
    repeatCount?: number;
    stereoSeparation?: number;
    interpolationFilter?: number;
    context?: AudioContext | false;
    workletUrl?: string;
  });
}
