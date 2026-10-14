// language: JavaScript, file: index.js, runtime: Kettu / Revenge (Vendetta fork)
// IIFE wrapped. no export default. FluxDispatcher MESSAGE_CREATE.
// sendMessage uses the 4th-arg reply signature. cooldown set before send.

(function () {
  const CONFIG = {
    defaultReply: "hey — i'm afk right now, i'll reply when i'm back.",
    cooldownMs: 30 * 60 * 1000,
    replyToDMs: true,
    replyToMentionsInServers: true,
    replyToAllServerMessages: false,
    ignoreBots: true,
    ignoreUsers: [],
    perUser: {},
    perUserCooldown: {},
  };

  let enabled = true;
  let fluxHandler = null;
  const lastReply = new Map();
  const lastReplyUser = new Map();

  function getStore(name) {
    try { return vendetta?.metro?.findByStoreName?.(name) ?? null; } catch (e) { return null; }
  }
  function getByProps() {
    try {
      const args = Array.prototype.slice.call(arguments);
      return vendetta?.metro?.findByProps?.apply(null, args) ?? null;
    } catch (e) { return null; }
  }
  function getSelfId() {
    try { return getStore("UserStore")?.getCurrentUser?.()?.id ?? null; } catch (e) { return null; }
  }
  function isBot(id) {
    if (!CONFIG.ignoreBots) return false;
    try { return !!getStore("UserStore")?.getUser?.(id)?.bot; } catch (e) { return false; }
  }
  function replyTextFor(id) { return CONFIG.perUser[id] ?? CONFIG.defaultReply; }
  function cooldownFor(id) { return CONFIG.perUserCooldown[id] ?? CONFIG.cooldownMs; }
  function passesCooldown(c, a) {
    const n = Date.now(), cd = cooldownFor(a);
    return (n - (lastReply.get(c) ?? 0) >= cd) && (n - (lastReplyUser.get(a) ?? 0) >= cd);
  }
  function shouldReply(info) {
    const channelId = info.channelId, authorId = info.authorId;
    const isDM = info.isDM, isMention = info.isMention;
    if (!enabled) return false;
    if (authorId === getSelfId()) return false;
    if (CONFIG.ignoreUsers.indexOf(authorId) !== -1) return false;
    if (isBot(authorId)) return false;
    if (isDM) {
      if (!CONFIG.replyToDMs) return false;
    } else {
      if (isMention && !CONFIG.replyToMentionsInServers) return false;
      if (!isMention && !CONFIG.replyToAllServerMessages) return false;
    }
    return passesCooldown(channelId, authorId);
  }

  async function sendReply(info) {
    try {
      const mod = getByProps("sendMessage", "editMessage");
      const sendMessage = mod && mod.sendMessage;
      if (!sendMessage) return;

      // set cooldown BEFORE send — closes the race where two quick
      // messages both pass the check before either writes the timestamp.
      const n = Date.now();
      lastReply.set(info.channelId, n);
      lastReplyUser.set(info.authorId, n);

      const body = {
        content: replyTextFor(info.authorId),
        tts: false,
        invalidEmojis: [],
        validNonShortcutEmojis: [],
      };
      const opts = {
        messageReference: info.isDM
          ? undefined
          : { channel_id: info.channelId, message_id: info.messageId },
        allowedMentions: { parse: [], replied_user: false },
      };

      await sendMessage(info.channelId, body, undefined, opts);
    } catch (e) {
      try { vendetta.logger.warn("[AFK] send failed", e && e.message); } catch (_) {}
    }
  }

  function onMessageCreate(payload) {
    try {
      const m = payload && payload.message;
      if (!m || !m.channel_id || !m.author || !m.author.id) return;
      const selfId = getSelfId();
      if (!selfId || m.author.id === selfId) return;
      const ChannelStore = getStore("ChannelStore");
      const channel = ChannelStore && ChannelStore.getChannel && ChannelStore.getChannel(m.channel_id);
      if (!channel) return;
      const isDM = channel.type === 1 || channel.type === 3;
      const mentions = m.mentions || [];
      let isMention = false;
      for (let i = 0; i < mentions.length; i++) {
        if (mentions[i] && mentions[i].id === selfId) { isMention = true; break; }
      }
      if (!shouldReply({ channelId: m.channel_id, authorId: m.author.id, isDM: isDM, isMention: isMention })) return;
      sendReply({
        channelId: m.channel_id,
        messageId: m.id,
        authorId: m.author.id,
        isDM: isDM,
      }).catch(function () {});
    } catch (e) {
      try { vendetta.logger.warn("[AFK] handler err", e && e.message); } catch (_) {}
    }
  }

  function findFluxDispatcher() {
    try {
      const common = vendetta && vendetta.metro && vendetta.metro.common;
      if (common && common.FluxDispatcher) return common.FluxDispatcher;
    } catch (e) {}
    return getByProps("dispatch", "subscribe");
  }

  function attach() {
    try {
      const FD = findFluxDispatcher();
      if (!FD || typeof FD.subscribe !== "function") {
        try { vendetta.logger.warn("[AFK] FluxDispatcher not found"); } catch (_) {}
        return;
      }
      fluxHandler = onMessageCreate;
      FD.subscribe("MESSAGE_CREATE", fluxHandler);
      try { vendetta.logger.info("[AFK] subscribed to MESSAGE_CREATE"); } catch (_) {}
    } catch (e) {
      try { vendetta.logger.error("[AFK] attach failed", e && e.message); } catch (_) {}
    }
  }

  function detach() {
    try {
      const FD = findFluxDispatcher();
      if (FD && fluxHandler && typeof FD.unsubscribe === "function") {
        FD.unsubscribe("MESSAGE_CREATE", fluxHandler);
      }
      fluxHandler = null;
    } catch (e) {}
  }

  return {
    onLoad: function () { attach(); },
    onUnload: function () { detach(); },
  };
})();
