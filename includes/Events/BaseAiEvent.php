<?php

namespace AI\JetFormBuilder\Events;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use Jet_Form_Builder\Actions\Events\Base_Event;
use function __;

abstract class BaseAiEvent extends Base_Event {

	public function get_label(): string {
		return __( 'AI Verdict', 'ai-for-jetformbuilder' );
	}

	public function get_help(): string {
		return __(
			'Triggered after AI Verdict action evaluates the response.',
			'ai-for-jetformbuilder'
		);
	}

	/**
	 * AI events should not run automatically on form submit.
	 *
	 * @return array
	 */
	public function supported_events(): array {
		return array();
	}

	public function to_array(): array {
		return parent::to_array() + array(
			'always' => false,
		);
	}
}
