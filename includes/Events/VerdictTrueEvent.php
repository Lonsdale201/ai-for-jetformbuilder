<?php

namespace AI\JetFormBuilder\Events;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use function __;

class VerdictTrueEvent extends BaseAiEvent {

	public function get_id(): string {
		return 'AI.TRUE';
	}

	public function get_label(): string {
		return __( 'AI Verdict: TRUE', 'ai-for-jetformbuilder' );
	}

	public function executors(): array {
		return array(
			new VerdictExecutor(),
		);
	}
}
