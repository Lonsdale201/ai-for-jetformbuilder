(function registerAiVerdictAction(wp, JetFBActions, actionData, jfb, aiSettings) {
  if (typeof console !== "undefined" && console.debug) {
    console.debug("[AI JFB] editor script ready", actionData);
  }
  if (!wp) {
    return;
  }

  // JFB has two action registration APIs: modern jfb.actions.registerAction
  // and legacy JetFBActions.addAction. Prefer modern, fall back to legacy.
  // NEVER call both — dual registration corrupts the editor data store and
  // produces JSON.parse "[object Object]" crashes in form.builder.js.
  const hasModernAction =
    jfb && jfb.actions && typeof jfb.actions.registerAction === "function";
  const hasLegacyAction =
    JetFBActions && typeof JetFBActions.addAction === "function";

  if (!hasModernAction && !hasLegacyAction) {
    return;
  }

  const registerAction = (type, component, config) => {
    if (hasModernAction) {
      jfb.actions.registerAction({
        type,
        edit: component,
        ...config,
      });
      return;
    }
    JetFBActions.addAction(type, component, config);
  };

  const { __ } = wp.i18n || { __: (str) => str };
  const { createElement, Fragment } = wp.element || {};
  const {
    TextareaControl,
    SelectControl,
    Button,
    ButtonGroup,
    CardFooter,
    Flex,
  } = wp.components || {};

  const { addFilter } = wp.hooks || {};

  if (!createElement || !Fragment || !TextareaControl || !SelectControl) {
    return;
  }

  const jetFormBuilder = jfb || {};
  const jfbComponents = jetFormBuilder.components || {};
  const jetFBRegistry = window.JetFBComponents || {};
  const jfbBlocks = jetFormBuilder.blocksToActions || {};

  const StyledTextarea = jfbComponents.StyledTextareaControl || TextareaControl;
  const StyledSelect = jfbComponents.StyledSelectControl || SelectControl;
  const HelpComponent = jfbComponents.Help || null;
  const useFields =
    typeof jfbBlocks.useFields === "function" ? jfbBlocks.useFields : null;
  const RowControl = jfbComponents.RowControl || null;
  const LabelWithActions = jfbComponents.LabelWithActions || null;
  const LabelComponent = jfbComponents.Label || null;
  const MacrosFields = jetFBRegistry.MacrosFields || null;

  const toStringValue = (value) => (typeof value === "string" ? value : "");

  const getLabel = (labelFn, key, fallback) => {
    if (typeof labelFn === "function") {
      try {
        const maybe = labelFn(key);
        if (maybe) {
          return maybe;
        }
      } catch (e) {
        // ignore
      }
    }

    if (actionData.__labels && actionData.__labels[key]) {
      return actionData.__labels[key];
    }

    return fallback;
  };

  const getHelp = (key, fallback) => {
    if (actionData.__help_messages && actionData.__help_messages[key]) {
      return actionData.__help_messages[key];
    }

    return fallback;
  };

  const FieldMapControl = ({ value, onChange, labelFn }) => {
    const fieldOptions = useFields
      ? useFields({ withInner: false, placeholder: "--" })
      : [{ value: "", label: "--" }];

    const label = getLabel(
      labelFn,
      "fields_map_answer",
      __("AI answer field", "ai-for-jetformbuilder")
    );

    const help = getHelp(
      "fields_map_answer",
      __(
        "Select the JetFormBuilder field that should store the generated AI answer. Required.",
        "ai-for-jetformbuilder"
      )
    );

    const isMissing = !toStringValue(value);

    // Render the label with a visible required asterisk, mirroring how JFB's
    // send-email action surfaces required fields (red `*` after the text).
    const requiredLabel = createElement(
      Fragment,
      null,
      label,
      createElement(
        "span",
        {
          "aria-hidden": "true",
          style: { color: "#cc1818", marginLeft: "4px", fontWeight: 600 },
        },
        "*"
      )
    );

    // Wrap the label in LabelWithActions even though we have no macro picker
    // here — that keeps horizontal alignment identical to the textareas
    // above (which DO have a MacrosFields button), so the asterisk doesn't
    // visibly drift to the left. When LabelWithActions isn't available,
    // fall back to a bare LabelComponent.
    const labelHeader = LabelWithActions
      ? (id) =>
          createElement(
            LabelWithActions,
            null,
            createElement(LabelComponent, { htmlFor: id }, requiredLabel)
          )
      : (id) =>
          createElement(LabelComponent, { htmlFor: id }, requiredLabel);

    return RowControl && LabelComponent
      ? createElement(RowControl, null, ({ id }) =>
          createElement(
            Fragment,
            null,
            labelHeader(id),
            createElement(StyledSelect, {
              id,
              help,
              required: true,
              "aria-required": "true",
              "aria-invalid": isMissing ? "true" : "false",
              value: toStringValue(value),
              options: fieldOptions,
              onChange,
              __nextHasNoMarginBottom: true,
              __next40pxDefaultSize: true,
            })
          )
        )
      : createElement(StyledSelect, {
          label: requiredLabel,
          help,
          required: true,
          "aria-required": "true",
          "aria-invalid": isMissing ? "true" : "false",
          value: toStringValue(value),
          options: fieldOptions,
          onChange,
          __nextHasNoMarginBottom: true,
          __next40pxDefaultSize: true,
        });
  };

  const AiVerdict = (props) => {
   const { settings, onChangeSetting, label } = props;

   const instructions = toStringValue(settings.instructions);
   const fieldsMap = {
     answer: "",
     ...(settings.fields_map || {}),
   };
    const messageTrue = toStringValue(settings.message_true);
    const messageFalse = toStringValue(settings.message_false);

   const instructionsLabel = getLabel(
     label,
     "instructions",
     __("AI instructions", "ai-for-jetformbuilder")
   );

    const instructionsHelp = getHelp(
      "instructions",
      __(
        "Provide the instruction prompt that will be sent to the AI before generating an answer.",
        "ai-for-jetformbuilder"
      )
    );

    const updateInstructions = (value) => {
     onChangeSetting(value, "instructions");
   };

    const updateMessageTrue = (value) => {
      onChangeSetting(value, "message_true");
    };

    const updateMessageFalse = (value) => {
      onChangeSetting(value, "message_false");
    };

    const updateFieldMap = (key, value) => {
      onChangeSetting(
        {
          ...fieldsMap,
          [key]: value,
        },
        "fields_map"
      );
    };

    const instructionsControl =
      RowControl && LabelWithActions && LabelComponent && MacrosFields
        ? createElement(RowControl, null, ({ id }) =>
            createElement(
              Fragment,
              null,
              createElement(
                LabelWithActions,
                null,
                createElement(
                  LabelComponent,
                  { htmlFor: id },
                  instructionsLabel
                ),
                createElement(MacrosFields, {
                  withCurrent: true,
                  onClick: (macro) =>
                    updateInstructions(`${instructions}${macro}`),
                })
              ),
              createElement(StyledTextarea, {
                id,
                value: instructions,
                onChange: updateInstructions,
                rows: 5,
                help: instructionsHelp,
                __nextHasNoMarginBottom: true,
                __next40pxDefaultSize: true,
              })
            )
          )
        : createElement(StyledTextarea, {
            label: instructionsLabel,
            help: instructionsHelp,
            value: instructions,
            onChange: updateInstructions,
            rows: 5,
            __nextHasNoMarginBottom: true,
            __next40pxDefaultSize: true,
          });

    const messageTrueLabel = getLabel(
      label,
      "message_true",
      __("Message if true", "ai-for-jetformbuilder")
    );

    const messageTrueHelp = getHelp(
      "message_true",
      __(
        "Optional instructions for the success message.",
        "ai-for-jetformbuilder"
      )
    );

    const messageTrueControl =
      RowControl && LabelWithActions && LabelComponent && MacrosFields
        ? createElement(RowControl, null, ({ id }) =>
            createElement(
              Fragment,
              null,
              createElement(
                LabelWithActions,
                null,
                createElement(
                  LabelComponent,
                  { htmlFor: id },
                  messageTrueLabel
                ),
                createElement(MacrosFields, {
                  withCurrent: true,
                  onClick: (macro) =>
                    updateMessageTrue(`${messageTrue}${macro}`),
                })
              ),
              createElement(StyledTextarea, {
                id,
                value: messageTrue,
                onChange: updateMessageTrue,
                rows: 3,
                help: messageTrueHelp,
                __nextHasNoMarginBottom: true,
                __next40pxDefaultSize: true,
              })
            )
          )
        : createElement(StyledTextarea, {
            label: messageTrueLabel,
            help: messageTrueHelp,
            value: messageTrue,
            onChange: updateMessageTrue,
            rows: 3,
            __nextHasNoMarginBottom: true,
            __next40pxDefaultSize: true,
          });

    const messageFalseLabel = getLabel(
      label,
      "message_false",
      __("Message if false", "ai-for-jetformbuilder")
    );

    const messageFalseHelp = getHelp(
      "message_false",
      __(
        "Optional instructions for the failure message.",
        "ai-for-jetformbuilder"
      )
    );

    const messageFalseControl =
      RowControl && LabelWithActions && LabelComponent && MacrosFields
        ? createElement(RowControl, null, ({ id }) =>
            createElement(
              Fragment,
              null,
              createElement(
                LabelWithActions,
                null,
                createElement(
                  LabelComponent,
                  { htmlFor: id },
                  messageFalseLabel
                ),
                createElement(MacrosFields, {
                  withCurrent: true,
                  onClick: (macro) =>
                    updateMessageFalse(`${messageFalse}${macro}`),
                })
              ),
              createElement(StyledTextarea, {
                id,
                value: messageFalse,
                onChange: updateMessageFalse,
                rows: 3,
                help: messageFalseHelp,
                __nextHasNoMarginBottom: true,
                __next40pxDefaultSize: true,
              })
            )
          )
        : createElement(StyledTextarea, {
            label: messageFalseLabel,
            help: messageFalseHelp,
            value: messageFalse,
            onChange: updateMessageFalse,
            rows: 3,
            __nextHasNoMarginBottom: true,
            __next40pxDefaultSize: true,
          });

    return createElement(
      Fragment,
      null,
      instructionsControl,
      messageTrueControl,
      messageFalseControl,
      createElement(FieldMapControl, {
        value: fieldsMap.answer,
        onChange: (value) => updateFieldMap("answer", value),
        labelFn: label,
      })
    );
  };

  registerAction("chatgpt_decision", AiVerdict, {
    label:
      (actionData && actionData.action_name) ||
      __("AI Verdict", "ai-for-jetformbuilder"),
    category: "advanced",
  });

  const JetFBHooks = window.JetFBHooks || {};
  const JetFBComponents = window.JetFBComponents || {};

  const { useLoopedAction, useActionsEdit, useActions } = JetFBHooks;
  const { ActionItemWrapper, ActionItemBody } = JetFBComponents;

  const DECISION_ACTION = "chatgpt_decision";
  const EVENT_TRUE = "AI.TRUE";
  const EVENT_FALSE = "AI.FALSE";
  const DEFAULT_EVENT = "DEFAULT.PROCESS";

  // Gate the per-action TRUE/FALSE/Always toggle on the global setting.
  // The events themselves stay registered and usable as conditions even
  // when the visual shortcut is disabled — this only hides the UI layer.
  const showEventVisual =
    aiSettings && aiSettings.show_event_visual !== undefined
      ? !!aiSettings.show_event_visual
      : true;

  if (
    showEventVisual &&
    addFilter &&
    typeof useLoopedAction === "function" &&
    typeof useActionsEdit === "function" &&
    typeof useActions === "function" &&
    ActionItemWrapper &&
    ActionItemBody &&
    Button &&
    Flex
  ) {
    const stripVerdictEvents = (list) =>
      Array.isArray(list)
        ? list.filter(
            (eventId) => eventId !== EVENT_TRUE && eventId !== EVENT_FALSE
          )
        : [];

    addFilter(
      "jet.fb.action.item",
      "ai-for-jetformbuilder/verdict-toggle",
      (Original) =>
        function VerdictToggleWrapper() {
          const { action } = useLoopedAction();
          const { updateActionObj } = useActionsEdit();
          const [actions] = useActions();

          if (!action) {
            return createElement(Original, null);
          }

          const hasDecisionAction =
            Array.isArray(actions) &&
            actions.some((item) => item && item.type === DECISION_ACTION);

          if (!hasDecisionAction || action.type === DECISION_ACTION) {
            return createElement(Original, null);
          }

          const currentEvents = Array.isArray(action.events)
            ? action.events
            : [];
          let mode = "always";

          if (currentEvents.includes(EVENT_TRUE)) {
            mode = "true";
          } else if (currentEvents.includes(EVENT_FALSE)) {
            mode = "false";
          }

          const setMode = (nextMode) => {
            const baseEvents = stripVerdictEvents(currentEvents).filter(
              (eventId) => eventId !== DEFAULT_EVENT
            );

            let nextEvents;

            if (nextMode === "true") {
              nextEvents = [EVENT_TRUE, ...baseEvents];
            } else if (nextMode === "false") {
              nextEvents = [EVENT_FALSE, ...baseEvents];
            } else {
              nextEvents = stripVerdictEvents(currentEvents);

              if (!nextEvents.includes(DEFAULT_EVENT)) {
                nextEvents = [DEFAULT_EVENT, ...nextEvents];
              }
            }

            updateActionObj(action.id, {
              events: nextEvents,
            });
          };

          const controls = createElement(
            CardFooter || "div",
            null,
            createElement(
              Flex,
              {
                justify: "space-between",
                align: "center",
                style: { gap: "12px" },
              },
              createElement(
                "span",
                {
                  style: {
                    fontWeight: 500,
                  },
                },
                __("AI IF", "ai-for-jetformbuilder")
              ),
              createElement(
                ButtonGroup || Fragment,
                null,
                createElement(
                  Button,
                  {
                    variant: mode === "always" ? "primary" : "tertiary",
                    onClick: () => setMode("always"),
                    size: "small",
                  },
                  __("Always", "ai-for-jetformbuilder")
                ),
                createElement(
                  Button,
                  {
                    variant: mode === "true" ? "primary" : "tertiary",
                    onClick: () => setMode("true"),
                    size: "small",
                  },
                  __("If TRUE", "ai-for-jetformbuilder")
                ),
                createElement(
                  Button,
                  {
                    variant: mode === "false" ? "primary" : "tertiary",
                    onClick: () => setMode("false"),
                    size: "small",
                  },
                  __("If FALSE", "ai-for-jetformbuilder")
                )
              )
            )
          );

          return createElement(
            ActionItemWrapper,
            null,
            createElement(ActionItemBody, null, createElement(Original, null)),
            controls
          );
        }
    );
  }
})(
  window.wp || false,
  window.JetFBActions || false,
  window.ChatGptDecision || {},
  window.jfb || {},
  window.AiJfbSettings || {}
);
