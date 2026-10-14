// language: JavaScript, file: index.js, runtime: Revenge / Kettu
// hardened: no top-level React import, no unguarded store lookups, all calls wrapped.

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
let unpatchSend = null;
const lastReply = new Map();
const lastReplyUser = new Map();

function getStore(name) {
  try {
    if (!vendetta?.metro?.findByStoreName) return null;
    return vendetta.metro.findByStoreName(name) ?? null;
  } catch (e) { return null; }
}

function getByProps(...props) {
  try {
    if (!vendetta?.metro?.findByProps) return null;
    return vendetta.metro.findByProps(...props) ?? null;
  } catch (e) { return null; }
}

function loadState() {
  try {
    const raw = vendetta.storage.get("afk-v2-state");
    if (raw) {
      const parsed = JSON.parse(raw);
      enabled = parsed.enabled ?? true;
      for (const [k, v] of Object.entries(parsed.lastReply ?? {})) lastReply.set(k, v);
      for (const [k, v] of Object.entries(parsed.lastReplyUser ?? {})) lastReplyUser.set(k, v);
    }
  } catch (e) {
    vendetta.logger.warn("[AFK] load failed", e?.message ?? String(e));
  }
}

function saveState() {
  try {
    vendetta.storage.set("afk-v2-state", JSON.stringify({
      enabled,
      lastReply: Object.fromEntries(lastReply),
      lastReplyUser: Object.fromEntries(lastReplyUser),
    }));
  } catch (e) {
    vendetta.logger.warn("[AFK] save failed", e?.message ?? String(e));
  }
}

function getSelfId() {
  try {
    const UserStore = getStore("UserStore");
    return UserStore?.getCurrentUser?.()?.id ?? null;
  } catch (e) { return null; }
}

function isBot(userId) {
  if (!CONFIG.ignoreBots) return false;
  try {
    const UserStore = getStore("UserStore");
    return !!UserStore?.getUser?.(userId)?.bot;
  } catch (e) { return false; }
}

function replyTextFor(userId) {
  return CONFIG.perUser[userId] ?? CONFIG.defaultReply;
}

function cooldownFor(userId) {
  return CONFIG.perUserCooldown[userId] ?? CONFIG.cooldownMs;
}

function passesCooldown(channelId, authorId) {
  const now = Date.now();
  const lastChannel = lastReply.get(channelId) ?? 0;
  const lastUser = lastReplyUser.get(authorId) ?? 0;
  const cd = cooldownFor(authorId);
  return (now - lastChannel >= cd) && (now - lastUser >= cd);
}

function shouldReply({ channelId, authorId, isDM, isMention }) {
  if (!enabled) return false;
  if (authorId === getSelfId()) return false;
  if (CONFIG.ignoreUsers.includes(authorId)) return false;
  if (isBot(authorId)) return false;
  if (isDM) {
    if (!CONFIG.replyToDMs) return false;
  } else {
    if (isMention && !CONFIG.replyToMentionsInServers) return false;
    if (!isMention && !CONFIG.replyToAllServerMessages) return false;
  }
  return passesCooldown(channelId, authorId);
}

async function sendReply({ channelId, messageId, authorId, isDM }) {
  try {
    const mod = getByProps("sendMessage", "editMessage");
    const sendMessage = mod?.sendMessage;
    if (!sendMessage) {
      vendetta.logger.warn("[AFK] sendMessage missing");
      return;
    }
    await sendMessage(channelId, {
      content: replyTextFor(authorId),
      messageReference: isDM ? undefined : { channel_id: channelId, message_id: messageId },
      allowedMentions: { parse: [], replied_user: false },
    });
    const now = Date.now();
    lastReply.set(channelId, now);
    lastReplyUser.set(authorId, now);
    saveState();
    vendetta.logger.info(`[AFK] replied to ${authorId} in ${channelId}`);
  } catch (e) {
    vendetta.logger.error("[AFK] send failed", e?.message ?? String(e));
  }
}

function patchIncoming() {
  try {
    if (!vendetta?.patcher?.after) {
      vendetta.logger.error("[AFK] patcher API missing");
      return;
    }
    const MessageStore = getStore("MessageStore");
    if (!MessageStore) {
      vendetta.logger.error("[AFK] MessageStore not found");
      return;
    }

    unpatchSend = vendetta.patcher.after(
      "AFK-v2",
      MessageStore,
      "receiveMessage",
      (self, args, ret) => {
        try {
          const message = args?.[0];
          if (!message?.channel_id || !message?.author?.id) return ret;
          const selfId = getSelfId();
          if (message.author.id === selfId) return ret;
          const ChannelStore = getStore("ChannelStore");
          const channel = ChannelStore?.getChannel?.(message.channel_id);
          if (!channel) return ret;
          const isDM = channel.type === 1 || channel.type === 3;
          const isMention = (message.mentions ?? []).some(m => m.id === selfId);
          if (!shouldReply({
            channelId: message.channel_id,
            authorId: message.author.id,
            isDM,
            isMention,
          })) return ret;
          sendReply({
            channelId: message.channel_id,
            messageId: message.id,
            authorId: message.author.id,
            isDM,
          }).catch(() => {});
        } catch (e) {
          vendetta.logger.warn("[AFK] patch handler error", e?.message ?? String(e));
        }
        return ret;
      }
    );
    vendetta.logger.info("[AFK] patched receiveMessage");
  } catch (e) {
    vendetta.logger.error("[AFK] patchIncoming failed", e?.message ?? String(e));
  }
}

function SettingsPanel() {
  try {
    let React = null;
    try { React = vendetta.metro.common?.React ?? null; } catch (e) {}
    if (!React) {
      return "AFK Auto-Responder — toggle on/off from the plugin list";
    }

    const [, force] = React.useReducer(x => x + 1, 0);

    return React.createElement("View", { style: { padding: 16 } },
      React.createElement("Text", {
        style: { fontSize: 18, fontWeight: "bold", marginBottom: 12, color: "#fff" }
      }, "AFK Auto-Responder v2"),

      React.createElement("Text", { style: { color: "#ccc", marginBottom: 8 } },
        `status: ${enabled ? "active" : "off"}`),

      React.createElement("Button", {
        title: enabled ? "Disable" : "Enable",
        onPress: () => { enabled = !enabled; saveState(); force(); },
        style: { marginBottom: 16 },
      }),

      React.createElement("Text", { style: { color: "#999", fontSize: 12 } },
        `default: ${CONFIG.defaultReply}`),

      React.createElement("Text", { style: { color: "#999", fontSize: 12, marginTop: 4 } },
        `custom replies: ${Object.keys(CONFIG.perUser).length}`),

      React.createElement("Text", { style: { color: "#999", fontSize: 12, marginTop: 4 } },
        `cooldown: ${CONFIG.cooldownMs / 60000} min / channel`),

      React.createElement("Text", { style: { color: "#999", fontSize: 12, marginTop: 4 } },
        `channels throttled: ${lastReply.size}`),

      React.createElement("Button", {
        title: "Clear cooldowns",
        onPress: () => { lastReply.clear(); lastReplyUser.clear(); saveState(); force(); },
        style: { marginTop: 16 },
      })
    );
  } catch (e) {
    vendetta.logger.warn("[AFK] settings panel render failed", e?.message ?? String(e));
    return "AFK Auto-Responder — settings panel failed to render";
  }
}

export default {
  onLoad() {
    try {
      loadState();
      patchIncoming();
      vendetta.logger.info("[AFK v2] loaded — enabled:", enabled);
    } catch (e) {
      vendetta.logger.error("[AFK v2] onLoad crashed", e?.message ?? String(e));
    }
  },
  onUnload() {
    try {
      unpatchSend?.();
      vendetta.logger.info("[AFK v2] unloaded");
    } catch (e) {
      vendetta.logger.warn("[AFK v2] onUnload error", e?.message ?? String(e));
    }
  },
  settings: SettingsPanel,
};
