<?php
/**
 * Plugin Name: AI for JetFormBuilder
 * Plugin URI:  https://github.com/Lonsdale201/ai-for-jetformbuilder
 * Description: Adds AI integration helpers (Verdict and Enrichment actions) for JetFormBuilder forms.
 * Author:      Soczó Kristóf
 * Author URI:  https://github.com/Lonsdale201
 * Version:     1.0
 * Text Domain: ai-for-jetformbuilder
 * Requires Plugins: jetformbuilder
 */

declare(strict_types=1);

use AI\JetFormBuilder\Plugin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'AI_JFB_VERSION', '1.0' );
define( 'AI_JFB_PLUGIN_FILE', __FILE__ );
define( 'AI_JFB_PLUGIN_PATH', plugin_dir_path( __FILE__ ) );
define( 'AI_JFB_PLUGIN_URL', plugins_url( '/', __FILE__ ) );

const AI_JFB_MIN_PHP_VERSION = '8.0';
const AI_JFB_MIN_WP_VERSION  = '6.0';

$autoload = AI_JFB_PLUGIN_PATH . 'vendor/autoload.php';
$update_checker_bootstrap = __DIR__ . '/plugin-update-checker/plugin-update-checker.php';

if ( file_exists( $update_checker_bootstrap ) ) {
	require_once $update_checker_bootstrap;
}

if ( file_exists( $autoload ) ) {
	require $autoload;
}

spl_autoload_register(
	static function ( string $class ): void {
		$prefix = 'AI\\JetFormBuilder\\';

		if ( 0 !== strpos( $class, $prefix ) ) {
			return;
		}

		$relative_class = substr( $class, strlen( $prefix ) );
		$relative_path  = str_replace( '\\', '/', $relative_class ) . '.php';
		$file           = AI_JFB_PLUGIN_PATH . 'includes/' . $relative_path;

		if ( file_exists( $file ) ) {
			require $file;
		}
	}
);

add_action(
	'init',
	static function () {
		$domain = 'ai-for-jetformbuilder';
		$locale = determine_locale();
		$mofile = WP_LANG_DIR . '/plugins/' . $domain . '-' . $locale . '.mo';

		if ( file_exists( $mofile ) ) {
			load_textdomain( $domain, $mofile );
		}

		load_plugin_textdomain(
			$domain,
			false,
			dirname( plugin_basename( AI_JFB_PLUGIN_FILE ) ) . '/languages'
		);
	}
);

register_activation_hook(
	__FILE__,
	static function (): void {
		$errors = aijfb_requirement_errors();

		if ( empty( $errors ) ) {
			return;
		}

		require_once ABSPATH . 'wp-admin/includes/plugin.php';
		deactivate_plugins( plugin_basename( __FILE__ ) );
		unset( $_GET['activate'] );

		$GLOBALS['aijfb_activation_errors'] = $errors;

		add_action( 'admin_notices', 'aijfb_activation_admin_notice' );
	}
);

if ( ! function_exists( 'aijfb_requirement_errors' ) ) {
	function aijfb_requirement_errors( bool $include_plugin_checks = true ): array {
		$errors = array();

		if ( version_compare( PHP_VERSION, AI_JFB_MIN_PHP_VERSION, '<' ) ) {
			$errors[] = sprintf(
				/* translators: 1: required PHP version, 2: current PHP version */
				__( 'AI for JetFormBuilder requires PHP version %1$s or higher. Current version: %2$s.', 'ai-for-jetformbuilder' ),
				AI_JFB_MIN_PHP_VERSION,
				PHP_VERSION
			);
		}

		global $wp_version;

		if ( version_compare( $wp_version, AI_JFB_MIN_WP_VERSION, '<' ) ) {
			$errors[] = sprintf(
				/* translators: 1: required WordPress version, 2: current WordPress version */
				__( 'AI for JetFormBuilder requires WordPress version %1$s or higher. Current version: %2$s.', 'ai-for-jetformbuilder' ),
				AI_JFB_MIN_WP_VERSION,
				$wp_version
			);
		}

		if ( ! $include_plugin_checks ) {
			return $errors;
		}

		if ( ! function_exists( 'jet_form_builder' ) && ! class_exists( '\Jet_Form_Builder\Plugin' ) ) {
			$errors[] = __( 'AI for JetFormBuilder requires the JetFormBuilder plugin to be installed and active.', 'ai-for-jetformbuilder' );
		}

		return $errors;
	}
}

if ( ! function_exists( 'aijfb_activation_admin_notice' ) ) {
	function aijfb_activation_admin_notice(): void {
		if ( empty( $GLOBALS['aijfb_activation_errors'] ) || ! is_array( $GLOBALS['aijfb_activation_errors'] ) ) {
			return;
		}

		$errors = $GLOBALS['aijfb_activation_errors'];

		printf(
			'<div class="notice notice-error is-dismissible"><p><strong>%s</strong></p><ul><li>%s</li></ul></div>',
			esc_html( __( 'AI for JetFormBuilder could not be activated.', 'ai-for-jetformbuilder' ) ),
			implode( '</li><li>', array_map( 'esc_html', $errors ) )
		);

		unset( $GLOBALS['aijfb_activation_errors'] );
	}
}

if ( ! function_exists( 'aijfb_admin_notice' ) ) {
	function aijfb_admin_notice(): void {
		$errors = $GLOBALS['aijfb_runtime_errors'] ?? aijfb_requirement_errors();

		if ( empty( $errors ) ) {
			return;
		}

		printf(
			'<div class="notice notice-error"><p><strong>%s</strong></p><ul><li>%s</li></ul></div>',
			esc_html( __( 'AI for JetFormBuilder cannot run:', 'ai-for-jetformbuilder' ) ),
			implode( '</li><li>', array_map( 'esc_html', $errors ) )
		);
	}
}

$initial_environment_errors = aijfb_requirement_errors( false );

if ( ! empty( $initial_environment_errors ) ) {
	$GLOBALS['aijfb_runtime_errors'] = $initial_environment_errors;

	if ( is_admin() ) {
		add_action( 'admin_notices', 'aijfb_admin_notice' );
	}

	return;
}

add_action(
	'plugins_loaded',
	static function () {
		$errors = aijfb_requirement_errors();

		if ( ! empty( $errors ) ) {
			$GLOBALS['aijfb_runtime_errors'] = $errors;

			if ( is_admin() ) {
				add_action( 'admin_notices', 'aijfb_admin_notice' );
			}

			return;
		}

		Plugin::instance( AI_JFB_PLUGIN_FILE );
	}
);
