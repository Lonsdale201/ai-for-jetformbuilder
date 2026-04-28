<?php

namespace AI\JetFormBuilder\Settings;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use AI\JetFormBuilder\Plugin;
use Jet_Form_Builder\Admin\Tabs_Handlers\Base_Handler;
use Jet_Form_Builder\Admin\Pages\Pages_Manager;
use function rest_sanitize_boolean;

class SettingsTab extends Base_Handler {

	public function slug() {
		return 'chatgpt-api-tab';
	}

	public function before_assets() {
		$handle = Plugin::instance()->slug() . '-' . $this->slug();

		$script_path = Plugin::instance()->path( 'assets/js/settings-tab.js' );
		$version     = file_exists( $script_path )
			? filemtime( $script_path )
			: '1.0.0';

		wp_deregister_script( $handle );

		wp_register_script(
			$handle,
			Plugin::instance()->url( 'assets/js/settings-tab.js' ),
			array(
				Pages_Manager::SCRIPT_VUEX_PACKAGE,
				'wp-hooks',
				'wp-i18n',
			),
			$version,
			true
		);

		wp_enqueue_script( $handle );

		if ( function_exists( 'wp_set_script_translations' ) ) {
			wp_set_script_translations(
				$handle,
				'ai-for-jetformbuilder'
			);
		}
	}

	public function on_get_request() {
		$api_key = sanitize_text_field(
			wp_unslash( $_POST['api_key'] ?? '' )
		);
		$model   = sanitize_text_field(
			wp_unslash( $_POST['model'] ?? '' )
		);
		$enable_log = rest_sanitize_boolean(
			wp_unslash( $_POST['enable_log'] ?? false )
		);
		$reasoning_effort = sanitize_text_field(
			wp_unslash( $_POST['reasoning_effort'] ?? 'medium' )
		);
		$max_output_tokens   = (int) ( $_POST['max_output_tokens'] ?? self::DEFAULT_MAX_OUTPUT_TOKENS );
		$monthly_request_cap = (int) ( $_POST['monthly_request_cap'] ?? 0 );
		$failure_mode        = sanitize_text_field(
			wp_unslash( $_POST['failure_mode'] ?? 'halt' )
		);
		$show_event_visual = rest_sanitize_boolean(
			wp_unslash( $_POST['show_event_visual'] ?? true )
		);

		$allowed_models  = array(
			'gpt-5-2025-08-07',
			'gpt-5-mini',
			'gpt-5-nano',
			'gpt-5-nano-2025-08-07',
			'gpt-5.4-nano',
			'gpt-5.4-nano-2026-03-17',
			'gpt-5.4-mini',
			'gpt-5.4-mini-2026-03-17',
			'gpt-5.4',
			'gpt-5.4-2026-03-05',
			'gpt-5.5',
			'gpt-5.5-2026-04-23',
		);
		$allowed_effort  = array( 'low', 'medium', 'high' );
		$allowed_failure = array( 'halt', 'permissive', 'restrictive' );

		if ( ! in_array( $model, $allowed_models, true ) ) {
			$model = 'gpt-5-mini';
		}

		if ( ! in_array( $reasoning_effort, $allowed_effort, true ) ) {
			$reasoning_effort = 'medium';
		}

		if ( ! in_array( $failure_mode, $allowed_failure, true ) ) {
			$failure_mode = 'halt';
		}

		$max_output_tokens   = $this->clamp_max_output_tokens( $max_output_tokens );
		$monthly_request_cap = $this->clamp_monthly_request_cap( $monthly_request_cap );

		$result = $this->update_options(
			array(
				'api_key'             => $api_key,
				'model'               => $model,
				'enable_log'          => (bool) $enable_log,
				'reasoning_effort'    => $reasoning_effort,
				'max_output_tokens'   => $max_output_tokens,
				'monthly_request_cap' => $monthly_request_cap,
				'failure_mode'        => $failure_mode,
				'show_event_visual'   => (bool) $show_event_visual,
			)
		);

		$this->send_response( $result );
	}

	public function on_load() {
		return $this->get_options(
			array(
				'api_key'             => '',
				'model'               => 'gpt-5-mini',
				'enable_log'          => false,
				'reasoning_effort'    => 'medium',
				'max_output_tokens'   => self::DEFAULT_MAX_OUTPUT_TOKENS,
				'monthly_request_cap' => 0,
				'failure_mode'        => 'halt',
				'show_event_visual'   => true,
			)
		);
	}

	public const DEFAULT_MAX_OUTPUT_TOKENS = 256;
	public const MIN_MAX_OUTPUT_TOKENS     = 32;
	public const MAX_MAX_OUTPUT_TOKENS     = 4096;

	private function clamp_max_output_tokens( int $value ): int {
		if ( $value < self::MIN_MAX_OUTPUT_TOKENS ) {
			return self::DEFAULT_MAX_OUTPUT_TOKENS;
		}
		if ( $value > self::MAX_MAX_OUTPUT_TOKENS ) {
			return self::MAX_MAX_OUTPUT_TOKENS;
		}
		return $value;
	}

	private function clamp_monthly_request_cap( int $value ): int {
		if ( $value < 0 ) {
			return 0; // 0 = unlimited
		}
		if ( $value > 1000000 ) {
			return 1000000;
		}
		return $value;
	}
}
