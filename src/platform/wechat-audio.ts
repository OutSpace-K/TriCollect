/** Configure native audio, while the game's own sound switch remains authoritative. */
export function configureWechatAudio(api: {
  setInnerAudioOption?(options: WechatMinigame.SetInnerAudioOption): void;
}) {
  try {
    api.setInnerAudioOption?.({
      obeyMuteSwitch: false,
      fail: (error) =>
        console.warn("TriCollect audio options unavailable", error),
    });
  } catch (error) {
    console.warn("TriCollect audio options unavailable", error);
  }
}

export function createWechatPlayer(
  api: Pick<WechatMinigame.Wx, "createInnerAudioContext">,
  src: string,
  loop = false,
  volume = 1,
) {
  const player = api.createInnerAudioContext();
  // Compatibility with base libraries older than setInnerAudioOption (2.3.0).
  player.obeyMuteSwitch = false;
  player.loop = loop;
  player.volume = volume;
  player.onError((error) =>
    console.warn("TriCollect audio unavailable", error),
  );
  player.src = src;
  return player;
}
