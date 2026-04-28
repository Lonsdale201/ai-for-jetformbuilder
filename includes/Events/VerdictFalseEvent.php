<?php

namespace AI\JetFormBuilder\Events;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use function __;

class VerdictFalseEvent extends BaseAiEvent {

	public function get_id(): string {
		return 'AI.FALSE';
	}

	public function get_label(): string {
		return __( 'AI Verdict: FALSE', 'ai-for-jetformbuilder' );
	}

	public function executors(): array {
		return array(
			new VerdictExecutor(),
		);
	}
}
