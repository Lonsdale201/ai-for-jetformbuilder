( function registerAiEnrichmentAction( wp, JetFBActions, actionData, jfb ) {
	if ( typeof console !== 'undefined' && console.debug ) {
		console.debug( '[AI JFB Enrichment] editor script ready', actionData );
	}
	if ( ! wp ) {
		return;
	}

	// Inject scoped CSS — mirrors the gsjfb-* patterns from
	// google-sheet-for-jetformbuilder for the label/tooltip system, plus
	// fixes for the WP Components nested structure that pure inline styles
	// cannot reach:
	//
	// 1) cgjfb-label / cgjfb-label-with-tooltip / cgjfb-tooltip-icon —
	//    consistent label styling with the dashicons info-outline icon,
	//    same proportions and hover behavior as Google Sheet.
	// 2) Force every WP component inside our row to width: 100% so it
	//    fills its flex cell (BaseControl, InputBase, the actual select
	//    / input / textarea elements).
	// 3) chatgpt-enrichment-remove-wrap — a 40px-tall wrapper that
	//    vertically centers the ✕ button against the inputs (not at the
	//    row bottom).
	( function injectStyles() {
		const STYLE_ID = 'chatgpt-jfb-enrichment-editor-styles';
		if ( typeof document === 'undefined' || document.getElementById( STYLE_ID ) ) {
			return;
		}
		const style = document.createElement( 'style' );
		style.id = STYLE_ID;
		style.textContent = [
			'.cgjfb-label {',
			'  display: block;',
			'  font-weight: 500;',
			'  font-size: 11px;',
			'  text-transform: uppercase;',
			'  letter-spacing: 0.02em;',
			'  margin-bottom: 6px;',
			'  color: #1e1e1e;',
			'  line-height: 1.4;',
			'}',
			'.cgjfb-label-with-tooltip {',
			'  display: flex;',
			'  align-items: center;',
			'  gap: 4px;',
			'  margin-bottom: 6px;',
			'}',
			'.cgjfb-label-with-tooltip .cgjfb-label {',
			'  margin-bottom: 0;',
			'}',
			'.cgjfb-tooltip-icon {',
			'  font-size: 16px;',
			'  width: 16px;',
			'  height: 16px;',
			'  color: #757575;',
			'  cursor: help;',
			'  line-height: 1;',
			'  vertical-align: middle;',
			'  margin-left: 4px;',
			'}',
			'.cgjfb-tooltip-icon:hover {',
			'  color: #2271b1;',
			'}',
			'.chatgpt-enrichment-row .components-base-control { width: 100%; }',
			'.chatgpt-enrichment-row .components-base-control__field { width: 100%; }',
			'.chatgpt-enrichment-row [data-wp-component="InputBase"] { width: 100%; }',
			'.chatgpt-enrichment-row .components-input-base { width: 100%; }',
			'.chatgpt-enrichment-row select { width: 100% !important; }',
			'.chatgpt-enrichment-row textarea.components-textarea-control__input { width: 100%; }',
			'.chatgpt-enrichment-row input.components-text-control__input { width: 100%; }',
		].join( '\n' );
		document.head.appendChild( style );
	}() );

	const hasModernAction =
		jfb && jfb.actions && typeof jfb.actions.registerAction === 'function';
	const hasLegacyAction =
		JetFBActions && typeof JetFBActions.addAction === 'function';

	if ( ! hasModernAction && ! hasLegacyAction ) {
		return;
	}

	const { __ } = wp.i18n || { __: ( s ) => s };
	const { createElement, Fragment } = wp.element || {};
	const {
		TextControl,
		TextareaControl,
		SelectControl,
		Button,
		Tooltip,
	} = wp.components || {};

	/**
	 * Tooltip icon — same pattern as google-sheet-for-jetformbuilder:
	 *   <span class="cgjfb-tooltip-icon dashicons dashicons-info-outline" />
	 * The CSS injected above sizes/colors it consistently, including a
	 * hover color shift to WP admin blue.
	 */
	const renderInfoIcon = () => createElement( 'span', {
		className: 'cgjfb-tooltip-icon dashicons dashicons-info-outline',
		'aria-hidden': 'true',
	} );

	/**
	 * Inline label-with-tooltip element. Wrapped in <span> so it works as a
	 * ReactNode passed to WP component `label` props.
	 */
	const labelWithTooltip = ( text, help ) => {
		if ( ! help || ! Tooltip ) {
			return text;
		}
		return createElement(
			'span',
			{ style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
			text,
			createElement( Tooltip, { text: help, position: 'top center' }, renderInfoIcon() )
		);
	};

	/**
	 * Standalone label rendered as a <div class="cgjfb-label-with-tooltip">
	 * containing <strong class="cgjfb-label"> + the tooltip icon. Mirrors
	 * google-sheet-for-jetformbuilder's pattern. Used in the row cells to
	 * escape JFB's outer left-label CSS grid that otherwise pushes
	 * TextControl's label into a left column.
	 */
	const manualLabel = ( text, help ) => createElement(
		'div',
		{ className: 'cgjfb-label-with-tooltip' },
		createElement( 'strong', { className: 'cgjfb-label' }, text ),
		help && Tooltip
			? createElement( Tooltip, { text: help, position: 'top center' }, renderInfoIcon() )
			: null
	);

	/**
	 * Wrap a control with our own label above it.
	 */
	const labeledField = ( text, help, control ) => createElement(
		'div',
		null,
		manualLabel( text, help ),
		control
	);

	if ( ! createElement || ! TextControl || ! SelectControl || ! Button ) {
		return;
	}

	const jetFormBuilder = jfb || {};
	const jfbComponents  = jetFormBuilder.components || {};
	const jfbBlocks      = jetFormBuilder.blocksToActions || {};
	const useFields      = typeof jfbBlocks.useFields === 'function' ? jfbBlocks.useFields : null;

	// Components for the macro inserter pattern (mirrors the Discord plugin).
	// MacrosFields is the picker button itself (clicking pops up the form's
	// available field IDs as %field_id% tokens). RowControl + LabelWithActions
	// + LabelComponent + StyledTextarea form the JFB-styled wrapper around a
	// labeled textarea with action buttons next to the label. All come from
	// JFB; if the installed JFB version is older and any are missing, we
	// silently fall back to a plain TextareaControl with no picker.
	const jetFBRegistry    = window.JetFBComponents || {};
	const MacrosFields     = jetFBRegistry.MacrosFields || null;
	const RowControl       = jfbComponents.RowControl || null;
	const LabelWithActions = jfbComponents.LabelWithActions || null;
	const LabelComponent   = jfbComponents.Label || null;
	// Fall back to wp.components.TextareaControl when JFB doesn't ship
	// StyledTextareaControl on the editor bundle — without this fallback the
	// macro picker gate below silently disables itself and the user gets a
	// bare textarea with no %field_id% inserter (mirrors action-editor.js).
	const StyledTextarea   = jfbComponents.StyledTextareaControl || TextareaControl;

	const TYPE_OPTIONS = Array.isArray( actionData.output_types ) && actionData.output_types.length
		? actionData.output_types
		: [
			{ value: 'string', label: __( 'String', 'ai-for-jetformbuilder' ) },
			{ value: 'integer', label: __( 'Integer', 'ai-for-jetformbuilder' ) },
			{ value: 'number', label: __( 'Number', 'ai-for-jetformbuilder' ) },
			{ value: 'boolean', label: __( 'Boolean', 'ai-for-jetformbuilder' ) },
			{ value: 'enum', label: __( 'Enum (one of …)', 'ai-for-jetformbuilder' ) },
			{ value: 'array', label: __( 'Array of strings (e.g. tags)', 'ai-for-jetformbuilder' ) },
		];

	const labelOf = ( key, fallback ) =>
		( actionData.__labels && actionData.__labels[ key ] ) || fallback;
	const helpOf = ( key, fallback ) =>
		( actionData.__help_messages && actionData.__help_messages[ key ] ) || fallback;

	const blankRow = () => ( {
		key: '',
		type: 'string',
		form_field: '',
		description: '',
		allowed_values: '',
	} );

	const ensureArray = ( value ) => ( Array.isArray( value ) ? value : [] );

	const registerAction = ( type, component, config ) => {
		if ( hasModernAction ) {
			jfb.actions.registerAction( {
				type,
				edit: component,
				...config,
			} );
			return;
		}
		JetFBActions.addAction( type, component, config );
	};

	const AiEnrichment = function AiEnrichment( props ) {
		const { settings = {}, onChangeSetting } = props;

		const instructions = typeof settings.instructions === 'string' ? settings.instructions : '';
		const outputFields = ensureArray( settings.output_fields );
		const tokenOverride = parseInt( settings.max_output_tokens_override, 10 ) || 0;

		const fieldOptions = useFields
			? useFields( { withInner: false, placeholder: '--' } )
			: [ { value: '', label: '--' } ];

		const updateRow = ( index, patch ) => {
			const next = outputFields.map( ( row, i ) =>
				i === index ? { ...row, ...patch } : row
			);
			onChangeSetting( next, 'output_fields' );
		};

		const addRow = () => {
			onChangeSetting( [ ...outputFields, blankRow() ], 'output_fields' );
		};

		const removeRow = ( index ) => {
			onChangeSetting(
				outputFields.filter( ( _, i ) => i !== index ),
				'output_fields'
			);
		};

		// Compact single-line layout for the main row.
		// Output key gets the most width (3 parts), target field 2 parts,
		// type 1 part, delete button auto-width. All four sit on one line
		// at typical viewport widths; flex-wrap handles narrow viewports.
		// Description is a textarea below, full-width. Allowed values
		// only renders when type === 'enum'.
		// Per-field help texts are tooltips on info icons next to each label.
		const renderRow = ( row, index ) => {
			const isEnum = row.type === 'enum';

			// position: relative so the absolute-positioned X in the
			// top-right corner anchors to this row container.
			// Right-padding leaves room for the X so it does not overlap
			// the right edge of the rightmost input.
			const rowContainerStyle = {
				border: '1px solid #ddd',
				borderRadius: '4px',
				padding: '12px 44px 12px 12px',
				marginBottom: '8px',
				background: '#fafafa',
				position: 'relative',
			};

			const headerStyle = {
				display: 'flex',
				gap: '8px',
				alignItems: 'flex-end',
				flexWrap: 'nowrap',
				width: '100%',
			};

			const removeCornerStyle = {
				position: 'absolute',
				top: '8px',
				right: '8px',
				zIndex: 1,
			};

			const subRowStyle = { marginTop: '12px' };

			// All row controls render with our own manualLabel above them and
			// pass `label=""` + `hideLabelFromVision: true` so WP's BaseControl
			// does not render its own label (which JFB's outer CSS grid would
			// hijack into a left column for TextControl, causing inconsistent
			// label-above vs label-left rendering inside one row).

			const keyControl = createElement( TextControl, {
				label: '',
				hideLabelFromVision: true,
				value: row.key || '',
				onChange: ( value ) => updateRow( index, { key: value } ),
				placeholder: 'company_name',
				__nextHasNoMarginBottom: true,
				__next40pxDefaultSize: true,
			} );

			const typeControl = createElement( SelectControl, {
				label: '',
				hideLabelFromVision: true,
				value: row.type || 'string',
				options: TYPE_OPTIONS,
				onChange: ( value ) => updateRow( index, { type: value } ),
				__nextHasNoMarginBottom: true,
				__next40pxDefaultSize: true,
			} );

			const targetControl = createElement( SelectControl, {
				label: '',
				hideLabelFromVision: true,
				value: row.form_field || '',
				options: fieldOptions,
				onChange: ( value ) => updateRow( index, { form_field: value } ),
				__nextHasNoMarginBottom: true,
				__next40pxDefaultSize: true,
			} );

			// Compact ✕ button — absolute-positioned in the row's top-right
			// corner so it semantically reads as "delete this whole row"
			// rather than competing with the inputs in the same flex line.
			const removeButton = createElement(
				'div',
				{ style: removeCornerStyle },
				createElement(
					Button,
					{
						isDestructive: true,
						variant: 'tertiary',
						onClick: () => removeRow( index ),
						label: __( 'Remove output', 'ai-for-jetformbuilder' ),
						showTooltip: true,
						style: {
							minWidth: '28px',
							width: '28px',
							height: '28px',
							padding: 0,
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
						},
					},
					'✕'
				)
			);

			const allowedValuesControl = isEnum
				? createElement( 'div', { style: subRowStyle },
					labeledField(
						__( 'Allowed values', 'ai-for-jetformbuilder' ),
						__( 'Comma-separated list of permitted values. The AI is hard-constrained to one of these via the JSON Schema enum.', 'ai-for-jetformbuilder' ),
						createElement( TextControl, {
							label: '',
							hideLabelFromVision: true,
							value: row.allowed_values || '',
							onChange: ( value ) => updateRow( index, { allowed_values: value } ),
							placeholder: 'technical, billing, general',
							__nextHasNoMarginBottom: true,
							__next40pxDefaultSize: true,
						} )
					)
				)
				: null;

			const descriptionControl = createElement( 'div', { style: subRowStyle },
				labeledField(
					__( 'Description (optional)', 'ai-for-jetformbuilder' ),
					__( 'Optional hint to the AI describing what this field means. Significantly improves accuracy on ambiguous extractions.', 'ai-for-jetformbuilder' ),
					createElement( TextareaControl, {
						label: '',
						hideLabelFromVision: true,
						value: row.description || '',
						onChange: ( value ) => updateRow( index, { description: value } ),
						rows: 2,
						placeholder: __(
							'e.g. "The customer’s primary contact email, not the support inbox."',
							'ai-for-jetformbuilder'
						),
						__nextHasNoMarginBottom: true,
					} )
				)
			);

			// Header: 3 cells fill 100% of the row width.
			//   Output key   — flex 3 (most space)
			//   Type         — flex 1, min 140px (slightly wider than before
			//                  so labels like "Array of strings (e.g. tags)"
			//                  fit comfortably)
			//   Target field — flex 2, no min so it fills the remainder
			const headerRow = createElement( 'div', { style: headerStyle },
				createElement( 'div', { style: { flex: '3 1 0', minWidth: '180px' } },
					labeledField(
						__( 'Output key', 'ai-for-jetformbuilder' ),
						__( 'Use lowercase letters, numbers and underscores only (e.g. company_name, priority).', 'ai-for-jetformbuilder' ),
						keyControl
					)
				),
				createElement( 'div', { style: { flex: '1 1 0', minWidth: '140px' } },
					labeledField(
						__( 'Type', 'ai-for-jetformbuilder' ),
						__( 'What kind of value the AI should produce. Enum constrains the output to one of a fixed set; Array of strings produces multi-value output (comma-joined when written to the form field).', 'ai-for-jetformbuilder' ),
						typeControl
					)
				),
				createElement( 'div', { style: { flex: '2 1 0', minWidth: '180px' } },
					labeledField(
						__( 'Target form field', 'ai-for-jetformbuilder' ),
						__( 'The form field where this AI output will be written. Subsequent actions can read it directly or via %field_id% macros.', 'ai-for-jetformbuilder' ),
						targetControl
					)
				)
			);

			return createElement(
				'div',
				{
					key: index,
					className: 'chatgpt-enrichment-row',
					style: rowContainerStyle,
				},
				removeButton,
				headerRow,
				allowedValuesControl,
				descriptionControl
			);
		};

		// ---- Top-level action editor body ---------------------------------

		// AI instructions textarea with optional macro picker — modeled on
		// the Discord plugin's pattern. When all required JFB components are
		// available, the textarea is rendered inside a RowControl with a
		// LabelWithActions header that shows the MacrosFields picker button
		// next to the label. Clicking a macro from the popover appends it to
		// the textarea content. Falls back to a plain TextareaControl when
		// any JFB component is missing.
		const instructionsLabelText = labelOf( 'instructions', __( 'AI instructions', 'ai-for-jetformbuilder' ) );
		const instructionsHelpText  = helpOf(
			'instructions',
			__( 'Tell the AI what to extract, classify or transform. Use %field_id% to reference any submitted form value, or click the macro picker to insert one.', 'ai-for-jetformbuilder' )
		);

		const canRenderMacroPicker =
			RowControl && LabelWithActions && LabelComponent && StyledTextarea && MacrosFields;

		const instructionsField = canRenderMacroPicker
			? createElement(
				RowControl,
				null,
				( { id } ) => createElement(
					Fragment,
					null,
					createElement(
						LabelWithActions,
						null,
						createElement(
							LabelComponent,
							{ htmlFor: id },
							labelWithTooltip( instructionsLabelText, instructionsHelpText )
						),
						createElement( MacrosFields, {
							withCurrent: true,
							onClick: ( macro ) => onChangeSetting( ( instructions || '' ) + macro, 'instructions' ),
						} )
					),
					createElement( StyledTextarea, {
						id,
						value: instructions,
						onChange: ( value ) => onChangeSetting( value, 'instructions' ),
						rows: 6,
						__nextHasNoMarginBottom: true,
						__next40pxDefaultSize: true,
					} )
				)
			)
			: createElement( TextareaControl, {
				label: labelWithTooltip( instructionsLabelText, instructionsHelpText ),
				value: instructions,
				onChange: ( value ) => onChangeSetting( value, 'instructions' ),
				rows: 6,
				__nextHasNoMarginBottom: true,
			} );

		const outputFieldsHeader = createElement(
			'div',
			{ style: { marginTop: '12px', marginBottom: '8px' } },
			createElement(
				'strong',
				null,
				labelWithTooltip(
					labelOf( 'output_fields', __( 'Output fields', 'ai-for-jetformbuilder' ) ),
					helpOf(
						'output_fields',
						__( 'Define one row per piece of data the AI should produce. Each row maps a JSON output key to a form field where the value will be written.', 'ai-for-jetformbuilder' )
					)
				)
			)
		);

		const rowsArea = outputFields.length === 0
			? createElement(
				'p',
				{ style: { fontStyle: 'italic', color: 'rgb(117, 117, 117)' } },
				__( 'No output fields configured yet — click “Add output” to add one.', 'ai-for-jetformbuilder' )
			)
			: createElement( Fragment, null, ...outputFields.map( renderRow ) );

		const addButton = createElement(
			Button,
			{
				variant: 'secondary',
				onClick: addRow,
				icon: 'plus-alt2',
			},
			__( 'Add output', 'ai-for-jetformbuilder' )
		);

		const tokenField = createElement( TextControl, {
			label: labelWithTooltip(
				labelOf( 'max_output_tokens_override', __( 'Max output tokens (override)', 'ai-for-jetformbuilder' ) ),
				helpOf(
					'max_output_tokens_override',
					__( 'Override the global Max output tokens setting for this action only. Leave empty (or 0) to use the global default.', 'ai-for-jetformbuilder' )
				)
			),
			type: 'number',
			min: 0,
			max: 4096,
			step: 1,
			value: tokenOverride === 0 ? '' : String( tokenOverride ),
			onChange: ( value ) => {
				const parsed = parseInt( value, 10 );
				onChangeSetting(
					isFinite( parsed ) && parsed > 0 ? parsed : 0,
					'max_output_tokens_override'
				);
			},
			__nextHasNoMarginBottom: true,
			__next40pxDefaultSize: true,
		} );

		return createElement(
			Fragment,
			null,
			instructionsField,
			outputFieldsHeader,
			rowsArea,
			createElement(
				'div',
				{ style: { marginTop: '8px', marginBottom: '16px' } },
				addButton
			),
			tokenField
		);
	};

	registerAction( 'chatgpt_enrichment', AiEnrichment, {
		label:
			( actionData && actionData.action_name )
			|| __( 'AI Enrichment', 'ai-for-jetformbuilder' ),
		category: 'advanced',
	} );
}(
	window.wp || false,
	window.JetFBActions || false,
	window.ChatGptEnrichment || {},
	window.jfb || {}
) );
