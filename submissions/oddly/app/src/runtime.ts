import { createChannelReceiver, MessagePortChannel, Methods, PortTransferType, transferPort } from "@microsoft/managed-apps-common/communication";
import type { Channel, PlatformBridge } from "@microsoft/managed-apps-common/communication";
import type { DataClientHost } from "@microsoft/managed-apps-common/dataClient";
import { abortable, completeAgentRequest } from "./completion";
import { initialsForName } from "./messages";

let connection: Promise<Channel> | undefined;
let initials: Promise<string> | undefined;

async function connect(): Promise<Channel> {
  const browser: Window & { __platformBridge?: PlatformBridge } = window;
  const receiver = createChannelReceiver();
  if (browser.__platformBridge) return browser.__platformBridge.connect(receiver);

  if (window.parent === window) {
    throw new Error("Open Oddly in the authenticated Managed Apps player. Bare localhost supports sample mode only.");
  }
  const { port1, port2 } = new MessageChannel();
  const channel = new MessagePortChannel(port1, { receiver, component: "app-sdk" });
  // Local Play can omit referrer information; use the SDK's standard parent-port handshake.
  transferPort(window.parent, port2, PortTransferType.SdkPort, "*");
  await channel.connect();
  return channel;
}

function getChannel(): Promise<Channel> {
  connection ??= connect();
  return connection;
}

export function getUserInitials(): Promise<string> {
  initials ??= getChannel().then(async channel => {
    const user = await channel.send(Methods.Auth.getUser, undefined, { timeout: 10_000 });
    if (typeof user.fullName !== "string") throw new Error("The player returned no profile name.");
    const value = initialsForName(user.fullName);
    if (!value) throw new Error("The player returned an empty profile name.");
    return value;
  }).catch(error => {
    console.warn("The player profile could not be loaded; showing a generic user avatar.");
    throw error;
  });
  return initials;
}

export function nativeHost(signal?: AbortSignal): DataClientHost {
  return {
    async sendHttpRequest(request) {
      const channel = await abortable(getChannel(), signal);
      return completeAgentRequest(
        (params, timeout) => channel.send(Methods.Http.send, params, { timeout }),
        request, signal,
      );
    },
    async getAppConnections() {
      const channel = await abortable(getChannel(), signal);
      const connections = await abortable(channel.send(Methods.Data.getAppConnections, undefined, { timeout: 30_000 }), signal);
      return Object.fromEntries(Object.entries(connections).map(([name, value]) => [name.toLowerCase(), value]));
    },
    trackEvent(eventName, properties) {
      getChannel().then(channel => {
        channel.notify(Methods.Telemetry.trackEvent, { eventName, properties });
      }).catch(() => { console.error("Native runtime telemetry could not be delivered."); });
    },
  };
}
