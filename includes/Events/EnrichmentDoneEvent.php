<?php

namespace AI\JetFormBuilder\Events;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use function __;

/**
 * Fires after the AI Enrichment action successfully wrote its outputs
 * to the form context. Other actions on the same form can wire to this
 * event so they only run once Enrichment has populated the new fields.
 *
 * The event also fires in failure-with-defaults mode (when failure_mode is
 * 'permissive' or 'restrictive' and the API call fails) — listeners should
 * therefore not assume the AI call succeeded; they only learn that
 * Enrichment finished its writes.
 */
class EnrichmentDoneEvent extends BaseAiEvent {

	public function get_id(): string {
		return 'AI.ENRICHMENT_DONE';
	}

	public function get_label(): string {
		return __( 'After AI Enrichment writes outputs', 'ai-for-jetformbuilder' );
	}

	public function get_help(): string {
		return __(
			'Triggered after the AI Enrichment action has finished writing AI-produced values into the form context (or fallback defaults on API failure).',
			'ai-for-jetformbuilder'
		);
	}

	public function executors(): array {
		return array(
			new VerdictExecutor(),
		);
	}
}
