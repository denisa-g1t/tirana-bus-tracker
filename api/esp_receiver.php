<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');

// File to store bus positions
$dataFile = 'bus_positions.json';

// Handle GET request - return current bus positions
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($dataFile)) {
        echo file_get_contents($dataFile);
    } else {
        echo json_encode([]);
    }
    exit;
}

// Handle POST request - receive data from ESP devices
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Validate required fields
    if (isset($input['device_id']) && isset($input['lat']) && isset($input['lon'])) {
        
        $positions = [];
        if (file_exists($dataFile)) {
            $positions = json_decode(file_get_contents($dataFile), true);
        }
        
        // Update or add bus position
        $found = false;
        for ($i = 0; $i < count($positions); $i++) {
            if ($positions[$i]['device_id'] == $input['device_id']) {
                $positions[$i] = array_merge($positions[$i], $input);
                $positions[$i]['last_update'] = time();
                $found = true;
                break;
            }
        }
        
        if (!$found) {
            $input['last_update'] = time();
            $positions[] = $input;
        }
        
        // Keep only last 60 seconds of data
        $positions = array_filter($positions, function($pos) {
            return (time() - $pos['last_update']) < 60;
        });
        
        file_put_contents($dataFile, json_encode(array_values($positions)));
        
        echo json_encode(['status' => 'ok', 'message' => 'Data received']);
    } else {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Missing required fields']);
    }
    exit;
}
?>
