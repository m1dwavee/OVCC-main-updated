<?php
// partners.php — server-side proxy for TruckersMP VTC partners
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');
header('Cache-Control: public, max-age=1800'); // cache 30 min, be nice to the API

$vtcId = 87827;
$url   = "https://api.truckersmp.com/v2/vtc/{$vtcId}/partners";

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT        => 8,
    CURLOPT_USERAGENT      => 'OrvionCC-Website/1.0 (+https://orvion.example)',
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false || $httpCode !== 200) {
    http_response_code(502);
    echo json_encode(['error' => true, 'response' => []]);
    exit;
}

echo $response;
?>
