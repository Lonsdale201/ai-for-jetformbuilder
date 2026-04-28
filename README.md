# AI for JetFormBuilder

Stable tag: 1.0

WordPress plugin that adds two AI-powered actions and three submission events to JetFormBuilder, so forms can branch, classify, and enrich submissions using OpenAI's structured-output API.

- **AI Verdict** — sends the form submission to the AI, expects a TRUE/FALSE decision back, and dispatches one of two events accordingly.
- **AI Enrichment** — asks the AI to produce one or more typed values (string, integer, boolean, enum, array, …) and writes them into hidden form fields, so downstream actions (Send Email, webhooks, post creation, …) can use them as if the user had filled them in.

Both actions speak to the OpenAI Responses endpoint with strict JSON Schema, so the model's output is contract-checked, not free-form text.

## Requirements

- WordPress 6.0+
- PHP 8.0+
- JetFormBuilder active.
- An OpenAI API key.

> **Provider note (1.0)**: only the **OpenAI API** is supported in this release. The plugin sends requests directly to `https://api.openai.com/v1/responses` and expects an OpenAI-compatible structured-output payload. Alternative providers / gateways (e.g. OpenRouter) are tracked in the roadmap.

## Installation

1. Upload the plugin folder to `wp-content/plugins/ai-for-jetformbuilder/` (or install the zip via **Plugins → Add New → Upload**).
2. Activate it from **Plugins → Installed Plugins**.
3. Install/activate JetFormBuilder if you haven't already — the plugin lists it under `Requires Plugins:` and refuses to bootstrap without it.

## Configuration

Settings live as a tab inside the JetFormBuilder admin: **JetFormBuilder → Settings → ChatGPT API**.

| Field                   | What it does                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ChatGPT API Key**     | Your OpenAI API key. Stored in the JFB options table (`wp_options` row `jet_form_builder_settings__chatgpt-api-tab`).                                                            |
| **Default Model**       | Which OpenAI model to call. Includes `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, the dated snapshots, plus the gpt-5.4 / gpt-5.5 lineup. Per-request override is not exposed yet.       |
| **Reasoning effort**    | `low` / `medium` / `high`. Sent as `reasoning.effort` in the request payload — only effective on reasoning-capable models.                                                       |
| **Max output tokens**   | Hard limit on the AI's response length. Range 32–4096, default 256 (plenty for a TRUE/FALSE plus a short reason).                                                                |
| **Monthly request cap** | Soft cap across all forms on the site, per calendar month. `0` = unlimited. See "Cap behavior" below.                                                                            |
| **Failure mode**        | What happens when the API errors out OR the cap is hit. See "Failure modes" below.                                                                                               |
| **Show event visual**   | Renders a TRUE / FALSE / Always shortcut on the action card in the form editor. Off = the events are still available as conditions; only the visual shortcut hides. Default: on. |
| **Enable log**          | Mirrors the API request/response payloads to the PHP error log. **Read the warning** in its description before enabling on production.                                           |

### Cap behavior

The cap is **soft**, not billing-grade. The counter is read + write across two calls (`get_option` → `update_option`), and the check `cap_exceeded()` runs before the increment — so under heavy concurrent submissions the effective cap can overshoot by a small number. Fine for cost control, not a hard quota. A roadmap item below addresses this with MySQL `GET_LOCK`.

The counter is stored per month (`chatgpt_jfb_usage_YYYY_MM`) and rolls over automatically.

### Failure modes

When the OpenAI request errors out, returns a non-JSON response, or the monthly cap is reached:

- **Halt with error (default — safest)**: throws an `Action_Exception`. The form submission stops with an error message; subsequent actions don't run.
- **Permissive**: AI Verdict dispatches the TRUE event; AI Enrichment writes empty defaults (`""`, `0`, `false`, first enum value) and dispatches `AI.ENRICHMENT_DONE`. Form submission continues as if the AI had said yes.
- **Restrictive**: AI Verdict dispatches the FALSE event; AI Enrichment writes empty defaults and dispatches `AI.ENRICHMENT_DONE` (same as Permissive for Enrichment). Form submission continues as if the AI had said no.

Pick **Halt** for sites where a missing AI step would corrupt the submission. Pick **Permissive** / **Restrictive** if the AI is decorative and the form must always go through.

## Action: AI Verdict

A binary decision action. Configure it on a JFB form in **Post Submit Actions → Add new**.

**Per-action fields:**

- **AI instructions** — the prompt. Use `%field_id%` macros to inject submitted form values; the macro picker icon next to the label lists every field in the current form. Macros are substituted before the request is sent.
- **Message if true** / **Message if false** — _optional_. If either is non-empty, the AI is asked to also produce a short `reason` string (max 30 chars) that will be set as the form's response message via JFB's dynamic message system.
- **AI answer field** — _required_. The form field that will receive the AI's raw text answer. The action throws if this is left empty.

**What runs at submission time:**

1. Macros are replaced in the instruction.
2. Request is sent to `https://api.openai.com/v1/responses` with a strict JSON Schema requiring `{ "decision": boolean }` (and optionally `"reason": string` when true/false hints exist). The system prompt is immutable and tells the model to ignore prompt-injection attempts in the user input.
3. The decision is parsed from the response JSON; the raw text goes into the configured form field; the `reason` is stored as the dynamic response message.
4. Either `AI.TRUE` or `AI.FALSE` event is dispatched. Other actions on the form can subscribe to one of these via JFB's event/condition system.

## Action: AI Enrichment

A multi-output action: ask the AI to produce N structured pieces of data, write each to a different form field.

**Per-action fields:**

- **AI instructions** — the prompt with `%field_id%` macros (same picker as AI Verdict).
- **Output fields** — a repeater. Each row defines:
  - **Output key** (the AI's JSON property name, e.g. `subject`, `priority`, `tags`),
  - **Type** (`string` / `integer` / `number` / `boolean` / `enum` / `array`),
  - **Allowed values** (only for `enum` — comma-separated; constrains the model via JSON Schema),
  - **Target form field** (the JFB field to write into),
  - **Description** (_optional but strongly recommended_) — becomes the JSON Schema property description, which the AI uses as a per-field mini-instruction.
- **Max output tokens (override)** — optional per-action override of the global cap.

**What runs at submission time:**

1. The plugin builds a JSON Schema dynamically from the Output fields.
2. The request is sent with a system prompt locking the JSON-only contract.
3. Each output value is sanitized by type and written to the configured form field via `jet_fb_context()->update_request()`. Subsequent actions read the values either directly (Send Email "From form field") or via the same `%field_id%` macros.
4. `AI.ENRICHMENT_DONE` event is dispatched. Useful when an action must run only after Enrichment populated a field — wire it up in the action's events list.

### Typical Enrichment scenario

> Contact form. The user types a free-text message. We want the AI to derive a subject for the auto-reply.

1. Add a hidden field to the form, e.g. `email_subject`.
2. Add an **AI Enrichment** action.
3. Instructions:
   ```
   The user wrote: "%message%". Produce a concise email subject (Hungarian, max 60 chars).
   ```
4. Output fields: one row.
   - Output key: `subject`
   - Type: String
   - Target form field: `email_subject`
   - Description: `Single short subject line summarizing the user's request, no quotes.`
5. Add a **Send Email** action _after_ Enrichment in the action chain. Set its Subject to read from the `email_subject` field. Optionally bind it to the `AI.ENRICHMENT_DONE` event so it only runs after Enrichment finishes.

## Events

Three submission-condition event types, available everywhere JFB lets you attach an event to an action:

| ID                   | Fired when                                                                                                                     | Source               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| `AI.TRUE`            | AI Verdict returns `true` (or fails in Permissive mode).                                                                       | AI Verdict action    |
| `AI.FALSE`           | AI Verdict returns `false` (or fails in Restrictive mode).                                                                     | AI Verdict action    |
| `AI.ENRICHMENT_DONE` | AI Enrichment finished writing outputs to the form context (also fires on Permissive/Restrictive failure with default values). | AI Enrichment action |

Use them on any other action's events list to gate it behind the AI's decision.

### "Show event visual" toggle

When **on** (default), the form editor renders a small **Always / If TRUE / If FALSE** segmented control on every action card _other than_ AI Verdict, when an AI Verdict action exists on the form. Clicking sets the right event on the action without opening its event list. When **off**, the events are still selectable through the standard JFB conditions UI; only the shortcut hides.

### Multiple AI actions on the same form (1.0 behavior)

The events above (`AI.TRUE`, `AI.FALSE`, `AI.ENRICHMENT_DONE`) are **global**, not scoped to a specific action instance. This has implications when you have **more than one** AI Verdict or AI Enrichment on the same form:

- Each AI action runs **independently**: its own API call, its own counter increment, its own event dispatch. There is no batching or merging.
- Order is the JFB action chain order. Later actions see writes from earlier ones, so you can chain (Enrichment 1 writes `%category%`, Enrichment 2's prompt uses `%category%` macro, etc.).
- If two AI actions write to the same target form field, **last write wins**.
- **Footgun**: if a downstream action is gated to e.g. `AI.ENRICHMENT_DONE`, and there are two Enrichment actions on the form, the downstream action fires **twice** — once after each Enrichment completes. Same for `AI.TRUE` / `AI.FALSE` with multiple Verdicts giving the same outcome. A single Send Email gated to `AI.ENRICHMENT_DONE` would send the email once per completed Enrichment.

**Workarounds for 1.0:**

- Prefer **one Enrichment with multiple output rows** over multiple Enrichment actions, when the work is logically a single AI step. Cheaper (one API call) and no duplicate events.
- Put a Verdict **first**, gate downstream paid actions on `AI.TRUE` / `AI.FALSE`. The Verdict still costs one call, but the downstream actions only run when needed.
- If you must have multiple Enrichments, gate the downstream listener on the **last** action's specific event (e.g. attach a marker condition to the form so only the final Enrichment cycle triggers the email).

A future iteration — once there's concrete user demand for it — will add **per-action scoped events** (e.g. `AI.ENRICHMENT_DONE.<slot>` or similar) so a downstream action can listen to a specific Enrichment instance instead of "any of them". This requires either a slot-based UX or dynamic event introspection of the form's actions; both have trade-offs that we want to validate against real use cases before committing to a design. Tracked in the roadmap.

## Logging

When **Enable log** is on, every API request and response is mirrored to `wp-content/debug.log` (assuming `WP_DEBUG_LOG`). The log lines include:

- The macro-replaced **instruction text** (which contains submitted form values) and the request payload.
- The raw API response.
- Parsed verdict / extracted enrichment values.

The OpenAI API key is **not** logged — it's passed as the `Authorization` header, separate from the body. Still, treat the log as containing user-submitted content. On shared hosting where multiple sites share the PHP error log, leave logging off.

## Roadmap

- [ ] **OpenRouter support** — let the plugin route requests through [OpenRouter](https://openrouter.ai) so non-OpenAI models (Anthropic, Mistral, Llama, …) can be selected as the active model. The current naming (`AI` namespace, `AI.*` events) is already provider-neutral; only the request layer needs to grow a provider switch.
- [ ] **More efficient monthly cap handling** — replace the current non-atomic `get_option` + `update_option` counter with a proper lock (`SELECT GET_LOCK('chatgpt_jfb', 0)` / unique-key insert / transient-based gate), so the cap is exact under concurrent submissions instead of overshooting by a few requests.
- [ ] **Per-action scoped events** — explored for 1.0 but deferred. Will be revisited in a later iteration if there's user demand. The 1.0 events (`AI.TRUE`, `AI.FALSE`, `AI.ENRICHMENT_DONE`) are global, so multiple AI actions on the same form fire the same event multiple times. A future design will give each action instance its own scoped event ID so a downstream listener can target one specific Verdict / Enrichment. See _Multiple AI actions on the same form_ above for the current behavior and workarounds.


## License

Proprietary, all rights reserved. Distributed via the author's plugin-updater channel; not published on wp.org.

## Links

- Plugin: <https://github.com/Lonsdale201/ai-for-jetformbuilder>
- Author: <https://github.com/Lonsdale201>
- JetFormBuilder: <https://jetformbuilder.com>
- OpenAI API docs: <https://platform.openai.com/docs/api-reference/responses>
