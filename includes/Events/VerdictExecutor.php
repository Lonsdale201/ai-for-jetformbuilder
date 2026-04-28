<?php

namespace AI\JetFormBuilder\Events;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use Jet_Form_Builder\Actions\Events\Base_Executor;

class VerdictExecutor extends Base_Executor {

	public function is_supported(): bool {
		return true;
	}
}
