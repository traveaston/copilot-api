# copilot-api

An API gateway that fronts GitHub Copilot and other model providers and records the token usage of every model call it proxies.

## Usage

**Request Event**:
One recorded model call with its model, token counts and cost.
_Avoid_: usage row, log entry, request (ambiguous with the inbound HTTP request)

**Session**:
The request events that share a session id, typically one agent conversation. The id comes from the client when it sends one; otherwise the gateway derives it. A request event with no session id is grouped with the other request events from the same inbound request, usually only itself.
_Avoid_: conversation, thread, chat

**Period**:
The reporting window chosen in the usage viewer (today, this week, last 7 days, …). Every total and listing is filtered to it.
_Avoid_: range, timeframe, window

## Models

**Model Creator**:
The company that trained a model (Anthropic, OpenAI, Google, …), regardless of which provider serves it. Every model has exactly one.
_Avoid_: provider, vendor, lab

**Provider**:
The upstream service a model call is routed to: GitHub Copilot or another configured upstream. One provider can serve models from several model creators.
_Avoid_: creator, vendor, host
