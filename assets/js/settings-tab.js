(function (wp) {
  if (!wp || !wp.hooks || !wp.i18n) {
    return;
  }

  const { addFilter } = wp.hooks;
  const { __ } = wp.i18n;

  const AiSettingsTab = {
    name: 'chatgpt-api-tab',
    props: {
      incoming: {
        type: Object,
        default() {
          return {};
        },
      },
    },
    data() {
      return {
        current: {
          api_key: '',
          model: 'gpt-5-mini',
          enable_log: false,
          reasoning_effort: 'medium',
          max_output_tokens: 256,
          monthly_request_cap: 0,
          failure_mode: 'halt',
          show_event_visual: true,
        },
        labels: {
          api_key: __('ChatGPT API Key', 'ai-for-jetformbuilder'),
          description: __('Paste the API key that JetFormBuilder actions should use when talking to ChatGPT.', 'ai-for-jetformbuilder'),
          model: __('Default Model', 'ai-for-jetformbuilder'),
          modelDescription: __('Choose which AI model JetFormBuilder actions should call by default.', 'ai-for-jetformbuilder'),
          enable_log: __('Enable log', 'ai-for-jetformbuilder'),
          enableLogDescription: __('Log AI API requests and responses to the PHP error log. Note: the logged request payload includes the macro-replaced instruction text, which may contain values submitted by your form users — keep this off in production unless actively troubleshooting, especially on shared hosting where the error log may be readable by others.', 'ai-for-jetformbuilder'),
          reasoningEffort: __('Reasoning effort', 'ai-for-jetformbuilder'),
          reasoningDescription: __('Select how much reasoning effort the AI should spend when evaluating verdicts.', 'ai-for-jetformbuilder'),
          maxOutputTokens: __('Max output tokens', 'ai-for-jetformbuilder'),
          maxOutputTokensDescription: __('Maximum tokens the AI can return per request. Lower values save cost; the default of 256 is plenty for a TRUE/FALSE verdict plus a short reason. Allowed range: 32–4096.', 'ai-for-jetformbuilder'),
          monthlyCap: __('Monthly request cap', 'ai-for-jetformbuilder'),
          monthlyCapDescription: __('Soft cap on the number of AI API calls per calendar month, summed across every form on the site. 0 = unlimited. When the cap is reached, further requests follow the Failure mode below. Counter is updated non-atomically (read + write), so under heavy concurrent submissions the cap may overshoot by a few requests — fine for cost-control, not a billing-grade limit.', 'ai-for-jetformbuilder'),
          failureMode: __('Failure mode', 'ai-for-jetformbuilder'),
          failureModeDescription: __('What AI actions do when the API errors out OR the monthly cap is reached. Halt = throw an error and stop the action chain. Permissive = Verdict dispatches TRUE event / Enrichment continues with empty defaults. Restrictive = Verdict dispatches FALSE event / Enrichment continues with empty defaults.', 'ai-for-jetformbuilder'),
          showEventVisual: __('Show event visual', 'ai-for-jetformbuilder'),
          showEventVisualDescription: __('Show the TRUE / FALSE / Always toggle on the action item card in the form editor. When off, the events are still available as conditions on the action — this only controls the visual shortcut.', 'ai-for-jetformbuilder'),
        },
        limits: {
          maxOutputTokensMin: 32,
          maxOutputTokensMax: 4096,
          maxOutputTokensDefault: 256,
          monthlyCapMin: 0,
          monthlyCapMax: 1000000,
        },
        failureOptions: [
          { value: 'halt', label: __('Halt with error (default — safest)', 'ai-for-jetformbuilder') },
          { value: 'permissive', label: __('Permissive (Verdict = TRUE / Enrichment continues)', 'ai-for-jetformbuilder') },
          { value: 'restrictive', label: __('Restrictive (Verdict = FALSE / Enrichment continues)', 'ai-for-jetformbuilder') },
        ],
        modelOptions: [
          { value: 'gpt-5-2025-08-07', label: 'gpt-5-2025-08-07' },
          { value: 'gpt-5-mini', label: 'gpt-5-mini' },
          { value: 'gpt-5-nano', label: 'gpt-5-nano' },
          { value: 'gpt-5-nano-2025-08-07', label: 'gpt-5-nano-2025-08-07' },
          { value: 'gpt-5.4-nano', label: 'gpt-5.4-nano' },
          { value: 'gpt-5.4-nano-2026-03-17', label: 'gpt-5.4-nano-2026-03-17' },
          { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
          { value: 'gpt-5.4-mini-2026-03-17', label: 'gpt-5.4-mini-2026-03-17' },
          { value: 'gpt-5.4', label: 'gpt-5.4' },
          { value: 'gpt-5.4-2026-03-05', label: 'gpt-5.4-2026-03-05' },
          { value: 'gpt-5.5', label: 'gpt-5.5' },
          { value: 'gpt-5.5-2026-04-23', label: 'gpt-5.5-2026-04-23' },
        ],
        reasoningOptions: [
          { value: 'low', label: __('Low', 'ai-for-jetformbuilder') },
          { value: 'medium', label: __('Medium', 'ai-for-jetformbuilder') },
          { value: 'high', label: __('High', 'ai-for-jetformbuilder') },
        ],
      };
    },
    created() {
      this.current = Object.assign({}, this.current, this.incoming || {});
      this.current.enable_log = !!this.current.enable_log;
      // show_event_visual defaults to true when missing entirely.
      this.current.show_event_visual =
        this.current.show_event_visual === undefined
          ? true
          : !!this.current.show_event_visual;
      if (!['low', 'medium', 'high'].includes(this.current.reasoning_effort)) {
        this.$set(this.current, 'reasoning_effort', 'medium');
      }
      if (!['halt', 'permissive', 'restrictive'].includes(this.current.failure_mode)) {
        this.$set(this.current, 'failure_mode', 'halt');
      }
      this.$set(this.current, 'max_output_tokens', this.normalizeMaxTokens(this.current.max_output_tokens));
      this.$set(this.current, 'monthly_request_cap', this.normalizeMonthlyCap(this.current.monthly_request_cap));
    },
    methods: {
      normalizeMaxTokens(raw) {
        const n = parseInt(raw, 10);
        if (!isFinite(n)) {
          return this.limits.maxOutputTokensDefault;
        }
        if (n < this.limits.maxOutputTokensMin) {
          return this.limits.maxOutputTokensDefault;
        }
        if (n > this.limits.maxOutputTokensMax) {
          return this.limits.maxOutputTokensMax;
        }
        return n;
      },
      normalizeMonthlyCap(raw) {
        const n = parseInt(raw, 10);
        if (!isFinite(n) || n < this.limits.monthlyCapMin) {
          return 0;
        }
        if (n > this.limits.monthlyCapMax) {
          return this.limits.monthlyCapMax;
        }
        return n;
      },
      getRequestOnSave() {
        return {
          data: Object.assign({}, this.current, {
            max_output_tokens: this.normalizeMaxTokens(this.current.max_output_tokens),
            monthly_request_cap: this.normalizeMonthlyCap(this.current.monthly_request_cap),
          }),
        };
      },
    },
    render(h) {
      const apiKeyField = h('cx-vui-input', {
        attrs: {
          label: this.labels.api_key,
          description: this.labels.description,
          size: 'fullwidth',
          'wrapper-css': ['equalwidth'],
        },
        model: {
          value: this.current.api_key,
          callback: (value) => {
            this.$set(this.current, 'api_key', value);
          },
          expression: 'current.api_key',
        },
      });

      const modelField = h('cx-vui-select', {
        props: {
          label: this.labels.model,
          description: this.labels.modelDescription,
          optionsList: this.modelOptions,
          valueKey: 'value',
          labelKey: 'label',
          size: 'fullwidth',
          wrapperCss: ['equalwidth'],
        },
        model: {
          value: this.current.model,
          callback: (value) => {
            this.$set(this.current, 'model', value);
          },
          expression: 'current.model',
        },
      });

      const enableLogField = h('cx-vui-switcher', {
        attrs: {
          label: this.labels.enable_log,
          description: this.labels.enableLogDescription,
          'wrapper-css': ['equalwidth'],
        },
        model: {
          value: !!this.current.enable_log,
          callback: (value) => {
            this.$set(this.current, 'enable_log', !!value);
          },
          expression: 'current.enable_log',
        },
      });

      const reasoningField = h('cx-vui-select', {
        props: {
          label: this.labels.reasoningEffort,
          description: this.labels.reasoningDescription,
          optionsList: this.reasoningOptions,
          valueKey: 'value',
          labelKey: 'label',
          size: 'fullwidth',
          wrapperCss: ['equalwidth'],
        },
        model: {
          value: this.current.reasoning_effort,
          callback: (value) => {
            if (['low', 'medium', 'high'].includes(value)) {
              this.$set(this.current, 'reasoning_effort', value);
            } else {
              this.$set(this.current, 'reasoning_effort', 'medium');
            }
          },
          expression: 'current.reasoning_effort',
        },
      });

      const maxTokensField = h('cx-vui-input', {
        attrs: {
          label: this.labels.maxOutputTokens,
          description: this.labels.maxOutputTokensDescription,
          type: 'number',
          min: this.limits.maxOutputTokensMin,
          max: this.limits.maxOutputTokensMax,
          step: 1,
          size: 'fullwidth',
          'wrapper-css': ['equalwidth'],
        },
        model: {
          value: this.current.max_output_tokens,
          callback: (value) => {
            this.$set(this.current, 'max_output_tokens', value);
          },
          expression: 'current.max_output_tokens',
        },
      });

      const monthlyCapField = h('cx-vui-input', {
        attrs: {
          label: this.labels.monthlyCap,
          description: this.labels.monthlyCapDescription,
          type: 'number',
          min: this.limits.monthlyCapMin,
          max: this.limits.monthlyCapMax,
          step: 1,
          size: 'fullwidth',
          'wrapper-css': ['equalwidth'],
        },
        model: {
          value: this.current.monthly_request_cap,
          callback: (value) => {
            this.$set(this.current, 'monthly_request_cap', value);
          },
          expression: 'current.monthly_request_cap',
        },
      });

      const failureModeField = h('cx-vui-select', {
        props: {
          label: this.labels.failureMode,
          description: this.labels.failureModeDescription,
          optionsList: this.failureOptions,
          valueKey: 'value',
          labelKey: 'label',
          size: 'fullwidth',
          wrapperCss: ['equalwidth'],
        },
        model: {
          value: this.current.failure_mode,
          callback: (value) => {
            if (['halt', 'permissive', 'restrictive'].includes(value)) {
              this.$set(this.current, 'failure_mode', value);
            } else {
              this.$set(this.current, 'failure_mode', 'halt');
            }
          },
          expression: 'current.failure_mode',
        },
      });

      const showEventVisualField = h('cx-vui-switcher', {
        attrs: {
          label: this.labels.showEventVisual,
          description: this.labels.showEventVisualDescription,
          'wrapper-css': ['equalwidth'],
        },
        model: {
          value: !!this.current.show_event_visual,
          callback: (value) => {
            this.$set(this.current, 'show_event_visual', !!value);
          },
          expression: 'current.show_event_visual',
        },
      });

      return h('div', [apiKeyField, modelField, reasoningField, maxTokensField, monthlyCapField, failureModeField, showEventVisualField, enableLogField]);
    },
  };

  const tabDefinition = {
    title: __('AI API', 'ai-for-jetformbuilder'),
    component: AiSettingsTab,
  };

  addFilter(
    'jet.fb.register.settings-page.tabs',
    'ai-for-jetformbuilder',
    (tabs) => {
      tabs.push(tabDefinition);

      return tabs;
    }
  );
})(window.wp);
