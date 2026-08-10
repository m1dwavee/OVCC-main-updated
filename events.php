<?php
// events.php — TruckersMP VTC 87827: hosted + attending events, or single event by ID
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');
header('Cache-Control: public, max-age=900'); // cache 15 minutes

$vtcId   = 87827;
$eventId = $_GET['id'] ?? $_GET['event_id'] ?? null;

$defaultOpts = [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_USERAGENT      => 'TruckersMP-API-Client/1.0',
    CURLOPT_HTTPHEADER     => ['Accept: application/json'],
];

// Single event request per TruckersMP API spec: GET /v2/events/{event_id} or /v2/vtc/{id}/events/{event_id}
if ($eventId !== null && is_numeric($eventId)) {
    $url = "https://api.truckersmp.com/v2/events/{$eventId}";
    $ch  = curl_init($url);
    curl_setopt_array($ch, $defaultOpts);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response !== false && $httpCode === 200) {
        $json = json_decode($response, true);
        if (isset($json['response']) && (!isset($json['error']) || !$json['error'])) {
            echo $response;
            exit;
        }
    }

    // Fallback to VTC event endpoint
    $url2 = "https://api.truckersmp.com/v2/vtc/{$vtcId}/events/{$eventId}";
    $ch2  = curl_init($url2);
    curl_setopt_array($ch2, $defaultOpts);
    $response2 = curl_exec($ch2);
    $httpCode2 = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
    curl_close($ch2);

    if ($response2 !== false && $httpCode2 === 200) {
        echo $response2;
        exit;
    }

    http_response_code(404);
    echo json_encode(['error' => true, 'response' => null]);
    exit;
}

// Merged events request (hosted + attending)
$baseUrl = "https://api.truckersmp.com/v2/vtc/{$vtcId}";
$urls    = [
    "{$baseUrl}/events",
    "{$baseUrl}/events/attending",
];

$mh      = curl_multi_init();
$handles = [];

foreach ($urls as $url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, $defaultOpts);
    curl_multi_add_handle($mh, $ch);
    $handles[] = $ch;
}

$running = null;
do {
    curl_multi_exec($mh, $running);
    curl_multi_select($mh);
} while ($running > 0);

$allEvents = [];
$seenIds   = [];

foreach ($handles as $ch) {
    $body     = curl_multi_getcontent($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_multi_remove_handle($mh, $ch);
    curl_close($ch);

    if (!$body || $httpCode !== 200) continue;

    $json = json_decode($body, true);
    if (!isset($json['response']) || !is_array($json['response'])) continue;

    foreach ($json['response'] as $event) {
        $id = $event['id'] ?? null;
        if ($id === null || isset($seenIds[$id])) continue;
        $seenIds[$id] = true;
        $allEvents[]  = $event;
    }
}

curl_multi_close($mh);

// Sort by start_at ascending
usort($allEvents, function ($a, $b) {
    return strcmp($a['start_at'] ?? '', $b['start_at'] ?? '');
});

echo json_encode([
    'error'    => false,
    'response' => $allEvents,
]);
