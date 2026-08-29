import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

const hasProxy = [
  process.env.HTTP_PROXY,
  process.env.HTTPS_PROXY,
  process.env.http_proxy,
  process.env.https_proxy,
].some((value) => Boolean(value?.trim()));

if (hasProxy) setGlobalDispatcher(new EnvHttpProxyAgent());
