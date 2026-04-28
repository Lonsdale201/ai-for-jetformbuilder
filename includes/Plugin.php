<?php

namespace AI\JetFormBuilder;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use AI\JetFormBuilder\Actions\AiVerdictAction;
use AI\JetFormBuilder\Actions\AiEnrichmentAction;
use AI\JetFormBuilder\Settings\SettingsTab;
use Jet_Form_Builder\Actions\Manager as ActionsManager;
use AI\JetFormBuilder\Events\VerdictTrueEvent;
use AI\JetFormBuilder\Events\VerdictFalseEvent;
use AI\JetFormBuilder\Events\EnrichmentDoneEvent;
use Jet_Form_Builder\Admin\Tabs_Handlers\Tab_Handler_Manager;
use Jet_Form_Builder\Form_Handler;
use Jet_Form_Builder\Form_Messages\Manager as Messages_Manager;
use YahnisElsts\PluginUpdateChecker\v5p0\PucFactory;

class Plugin {

	/**
	 * @var Plugin|null
	 */
	private static $instance = null;

	/**
	 * @var string
	 */
	private $slug = 'ai-for-jetformbuilder';

	/**
	 * Absolute path to the main plugin file — needed by PucFactory so it can
	 * resolve the plugin slug / metadata for the update checker.
	 *
	 * @var string
	 */
	private $plugin_file;

	private function __construct( string $plugin_file ) {
		$this->plugin_file = $plugin_file;

		$this->init_hooks();
		$this->init_updater();
	}

	public static function instance( ?string $plugin_file = null ): Plugin {
		if ( null === self::$instance ) {
			if ( null === $plugin_file ) {
				throw new \RuntimeException( 'Plugin file path is required on first initialization.' );
			}

			self::$instance = new self( $plugin_file );
		}

		return self::$instance;
	}

	public function slug(): string {
		return $this->slug;
	}

	public function url( string $path = '' ): string {
		return AI_JFB_PLUGIN_URL . ltrim( $path, '/' );
	}

	public function path( string $path = '' ): string {
		return AI_JFB_PLUGIN_PATH . ltrim( $path, '/' );
	}

	private function init_hooks() {
		add_filter(
			'jet-form-builder/register-tabs-handlers',
			array( $this, 'register_tabs' )
		);

		add_action(
			'jet-form-builder/actions/register',
			array( $this, 'register_actions' )
		);

		add_action(
			'jet-form-builder/editor-assets/before',
			array( $this, 'enqueue_editor_assets' )
		);

		add_filter(
			'jet-form-builder/event-types',
			array( $this, 'register_events' )
		);

		add_action(
			'jet-form-builder/form-handler/after-send',
			array( $this, 'maybe_adjust_response_message' ),
			25,
			2
		);

		add_filter(
			'plugin_action_links_' . plugin_basename( $this->plugin_file ),
			array( $this, 'filter_plugin_action_links' )
		);
	}

	/**
	 * Prepend a "Configure" link to this plugin's action-links column
	 * (the one alongside Activate/Deactivate/Edit) on /wp-admin/plugins.php,
	 * pointing to the plugin's settings tab inside the JFB Vue settings
	 * page (hash-routed).
	 *
	 * @param array $links Existing action-link entries (HTML strings).
	 *
	 * @return array
	 */
	public function filter_plugin_action_links( array $links ): array {
		$label         = __( 'Configure', 'ai-for-jetformbuilder' );
		// JFB's settings page lives under the jet-form-builder CPT submenu,
		// not under a top-level admin.php route. Mirrors the URL pattern
		// used by google-sheet-for-jetformbuilder's Configure link.
		$configure_url = admin_url( 'edit.php?post_type=jet-form-builder&page=jfb-settings#chatgpt-api-tab' );

		// Defensive: don't prepend a duplicate if something already added
		// a "Configure" link to this row.
		foreach ( $links as $existing ) {
			if ( false !== stripos( $existing, '>' . $label . '<' ) ) {
				return $links;
			}
		}

		$configure_link = sprintf(
			'<a href="%s">%s</a>',
			esc_url( $configure_url ),
			esc_html( $label )
		);

		// Prepend so Configure shows up before Deactivate, matching the
		// pattern used by Google Sheet for JetFormBuilder and most settings-
		// bearing WP plugins.
		array_unshift( $links, $configure_link );

		return $links;
	}

	public function register_tabs( array $tabs ): array {
		$tabs[] = new SettingsTab();

		return $tabs;
	}

	public function register_actions( ActionsManager $manager ): void {
		$manager->register_action_type( new AiVerdictAction() );
		$manager->register_action_type( new AiEnrichmentAction() );
	}

	public function enqueue_editor_assets(): void {
		$script_rel_path = 'assets/js/action-editor.js';
		$script_path     = $this->path( $script_rel_path );

		if ( ! file_exists( $script_path ) ) {
			return;
		}

		$handle  = $this->slug() . '-action-editor';
		$version = (string) filemtime( $script_path );

		$dependencies = array( 'jet-fb-components', 'wp-element', 'wp-components', 'wp-i18n', 'wp-hooks', 'wp-data' );

		// Conditionally depend on the v2 action editor handles when JFB
		// ships them — without these, the script can race the modern
		// jfb.actions API and run before window.jfb.actions is populated,
		// triggering JSON.parse "[object Object]" failures in form.builder.js.
		foreach ( array( 'jet-fb-actions-v2', 'jet-fb-blocks-v2-to-actions-v2' ) as $maybe_dep ) {
			if ( wp_script_is( $maybe_dep, 'registered' ) ) {
				$dependencies[] = $maybe_dep;
			}
		}

		wp_register_script(
			$handle,
			$this->url( $script_rel_path ),
			$dependencies,
			$version,
			true
		);

		wp_enqueue_script( 'jet-fb-components' );
		wp_enqueue_script( $handle );

		// Expose the show_event_visual setting to the editor; the action-editor
		// JS uses this to gate the per-action TRUE/FALSE/Always visual toggle.
		$show_event_visual = $this->resolve_show_event_visual();

		wp_add_inline_script(
			$handle,
			'window.AiJfbSettings = ' . wp_json_encode(
				array(
					'show_event_visual' => $show_event_visual,
				)
			) . ';',
			'before'
		);

		if ( function_exists( 'wp_set_script_translations' ) ) {
			wp_set_script_translations(
				$handle,
				'ai-for-jetformbuilder'
			);
		}

		// Enrichment action editor — separate script, same dependencies.
		$enrichment_rel  = 'assets/js/enrichment-editor.js';
		$enrichment_path = $this->path( $enrichment_rel );

		if ( file_exists( $enrichment_path ) ) {
			$enrichment_handle  = $this->slug() . '-enrichment-editor';
			$enrichment_version = (string) filemtime( $enrichment_path );

			wp_register_script(
				$enrichment_handle,
				$this->url( $enrichment_rel ),
				$dependencies,
				$enrichment_version,
				true
			);

			wp_enqueue_script( $enrichment_handle );

			if ( function_exists( 'wp_set_script_translations' ) ) {
				wp_set_script_translations(
					$enrichment_handle,
					'ai-for-jetformbuilder'
				);
			}
		}
	}

	private function init_updater(): void {
		if ( ! class_exists( PucFactory::class ) ) {
			return;
		}

		PucFactory::buildUpdateChecker(
			'https://pluginupdater.hellodevs.dev/plugins/ai-for-jetformbuilder.json',
			$this->plugin_file,
			'ai-for-jetformbuilder'
		);
	}

	private function resolve_show_event_visual(): bool {
		$options = Tab_Handler_Manager::instance()->options( 'chatgpt-api-tab', array() );

		// Default ON when the option is missing entirely.
		if ( ! array_key_exists( 'show_event_visual', $options ) ) {
			return true;
		}

		return (bool) $options['show_event_visual'];
	}

	public function register_events( array $events ): array {
		$events[] = new VerdictTrueEvent();
		$events[] = new VerdictFalseEvent();
		$events[] = new EnrichmentDoneEvent();

		return $events;
	}

	public function maybe_adjust_response_message( Form_Handler $form_handler, bool $is_success ): void {
		if ( ! isset( $form_handler->action_handler ) ) {
			return;
		}

		$handler  = $form_handler->action_handler;
		$messages = $handler->get_context( 'chatgpt_decision', 'chatgpt_decision_messages' );

		if ( empty( $messages ) || ! is_array( $messages ) ) {
			return;
		}

		$payload = end( $messages );

		if ( ! is_array( $payload ) ) {
			return;
		}

		$text = isset( $payload['message'] ) ? trim( (string) $payload['message'] ) : '';

		if ( '' === $text ) {
			return;
		}

		$decision = isset( $payload['decision'] ) ? (bool) $payload['decision'] : false;

		$status = $decision
			? Messages_Manager::dynamic_success( $text )
			: Messages_Manager::dynamic_error( $text );

		$form_handler->set_response_args(
			array(
				'status'  => $status,
				'message' => $text,
			)
		);
	}
}
