// language: JavaScript, file: index.js, runtime: Revenge / Kettu
// probe build — logs every API Revenge exposes, patches nothing.

export default {
  onLoad() {
    try {
      vendetta.logger.info("[AFK-probe] vendetta object:", typeof vendetta);
      vendetta.logger.info("[AFK-probe] patcher:", typeof vendetta?.patcher?.after);
      vendetta.logger.info("[AFK-probe] metro:", typeof vendetta?.metro?.findByStoreName);
      vendetta.logger.info("[AFK-probe] storage:", typeof vendetta?.storage?.get);
      vendetta.logger.info("[AFK-probe] logger:", typeof vendetta?.logger?.info);
      const MS = vendetta.metro?.findByStoreName?.("MessageStore");
      vendetta.logger.info("[AFK-probe] MessageStore:", !!MS);
      const CS = vendetta.metro?.findByStoreName?.("ChannelStore");
      vendetta.logger.info("[AFK-probe] ChannelStore:", !!CS);
      const US = vendetta.metro?.findByStoreName?.("UserStore");
      vendetta.logger.info("[AFK-probe] UserStore:", !!US);
      const mod = vendetta.metro?.findByProps?.("sendMessage", "editMessage");
      vendetta.logger.info("[AFK-probe] sendMessage mod:", !!mod?.sendMessage);
    } catch (e) {
      vendetta.logger.error("[AFK-probe] FAILED:", e?.message ?? String(e));
    }
  },
  onUnload() {},
};
