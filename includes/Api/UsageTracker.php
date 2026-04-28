<?php

namespace AI\JetFormBuilder\Api;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use function get_option;
use function gmdate;
use function update_option;

/**
 * Tracks AI API requests across the current calendar month.
 *
 * Stored as a per-month wp_option with key like `chatgpt_jfb_usage_2026_04`.
 * Auto-resets when the month rolls over (next call lands on a new key).
 * `autoload = false` so the option does not bloat the autoloaded options
 * cache; it is only read from the action's runtime hot path.
 */
class UsageTracker {

	const OPTION_PREFIX = 'chatgpt_jfb_usage_';

	public static function current_month_key(): string {
		return self::OPTION_PREFIX . gmdate( 'Y_m' );
	}

	public static function current_count(): int {
		return (int) get_option( self::current_month_key(), 0 );
	}

	/**
	 * @param int $cap 0 (or negative) means unlimited.
	 */
	public static function cap_exceeded( int $cap ): bool {
		if ( $cap <= 0 ) {
			return false;
		}
		return self::current_count() >= $cap;
	}

	public static function increment(): void {
		$key     = self::current_month_key();
		$current = (int) get_option( $key, 0 );
		update_option( $key, $current + 1, false );
	}

	/**
	 * Force-reset (used in admin tooling only — not called from runtime).
	 */
	public static function reset(): void {
		update_option( self::current_month_key(), 0, false );
	}
}
