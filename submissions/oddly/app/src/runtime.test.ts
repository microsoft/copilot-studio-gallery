import assert from "node:assert/strict";
import { test } from "node:test";
import { createChannelReceiver, MessagePortChannel, Methods } from "@microsoft/managed-apps-common/communication";
import { getUserInitials, nativeHost } from "./runtime";

test("profile initials and connector calls reuse one native channel without caching the profile", async () => {
  const { port1, port2 } = new MessageChannel();
  const receiver = createChannelReceiver();
  let profileRequests = 0;
  let connections = 0;
  receiver.onRequest(Methods.Auth.getUser, async () => () => {
    profileRequests++;
    return { fullName: "Avery Lane", objectId: "test-user", tenantId: "test-tenant" };
  });
  receiver.onRequest(Methods.Data.getAppConnections, async () => () => ({}));
  const host = new MessagePortChannel(port2, { receiver });
  const client = new MessagePortChannel(port1);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { __platformBridge: { connect: async () => {
      connections++;
      await client.connect();
      return client;
    } } },
  });
  try {
    const first = getUserInitials();
    assert.equal(first, getUserInitials());
    const [initials, bindings] = await Promise.all([first, nativeHost().getAppConnections()]);
    assert.equal(initials, "AL");
    assert.deepEqual(bindings, {});
    assert.equal(await getUserInitials(), "AL");
    assert.equal(profileRequests, 1);
    assert.equal(connections, 1);
  } finally {
    client.close();
    host.close();
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
