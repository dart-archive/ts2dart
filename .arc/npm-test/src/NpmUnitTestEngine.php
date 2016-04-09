<?php
class NpmUnitTestEngine extends ArcanistUnitTestEngine {
  public function run() {
    $retval = 0;
    system('npm test', $retval);
    $result = new ArcanistUnitTestResult();
    $result->setName('npm test');
    if ($retval == 0) {
      $result->setResult(ArcanistUnitTestResult::RESULT_PASS);
    } else {
      $result->setResult(ArcanistUnitTestResult::RESULT_FAIL);
    }
    return array($result);
  }

  public function shouldEchoTestResults() {
    return false;
  }
}
?>
