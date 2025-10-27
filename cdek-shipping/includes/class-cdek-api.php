<?php

if (!defined('ABSPATH')) {
    exit;
}

class CDEK_API {
    
    private $api_url = 'https://api.cdek.ru/v2/';
    private $test_api_url = 'https://api.edu.cdek.ru/v2/';
    private $account;
    private $password;
    private $is_test_mode;
    private $access_token;
    private $token_expires;
    
    public function __construct() {
        $this->account = get_option('cdek_account', 'Lr7x5fauu0eOXDA4hlK04HiMUpqHgzzR');
        $this->password = get_option('cdek_password', 'fzwKqoaKaTrwRjxVhf6csNzTefyHRHYM');
        $this->is_test_mode = get_option('cdek_test_mode', false);
        
        $this->access_token = get_transient('cdek_access_token');
        $this->token_expires = get_transient('cdek_token_expires');
    }
    
    /**
     * Get API URL based on test mode
     */
    private function get_api_url() {
        return $this->is_test_mode ? $this->test_api_url : $this->api_url;
    }
    
    /**
     * Get access token for API requests
     */
    private function get_access_token() {
        if ($this->access_token && $this->token_expires > time()) {
            return $this->access_token;
        }
        
        $url = $this->get_api_url() . 'oauth/token';
        
        $args = array(
            'method' => 'POST',
            'headers' => array(
                'Content-Type' => 'application/x-www-form-urlencoded',
            ),
            'body' => array(
                'grant_type' => 'client_credentials',
                'client_id' => $this->account,
                'client_secret' => $this->password,
            ),
            'timeout' => 30,
        );
        
        $response = wp_remote_request($url, $args);
        
        if (is_wp_error($response)) {
            error_log('CDEK API Error: ' . $response->get_error_message());
            return false;
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (isset($data['access_token'])) {
            $this->access_token = $data['access_token'];
            $this->token_expires = time() + $data['expires_in'] - 60; // 60 seconds buffer
            
            set_transient('cdek_access_token', $this->access_token, $data['expires_in'] - 60);
            set_transient('cdek_token_expires', $this->token_expires, $data['expires_in'] - 60);
            
            return $this->access_token;
        }
        
        error_log('CDEK API Token Error: ' . print_r($data, true));
        return false;
    }
    
    /**
     * Make API request
     */
    private function make_request($endpoint, $method = 'GET', $data = null) {
        $token = $this->get_access_token();
        
        if (!$token) {
            return false;
        }
        
        $url = $this->get_api_url() . $endpoint;
        
        $args = array(
            'method' => $method,
            'headers' => array(
                'Authorization' => 'Bearer ' . $token,
                'Content-Type' => 'application/json',
            ),
            'timeout' => 30,
        );
        
        if ($data && in_array($method, array('POST', 'PUT'))) {
            $args['body'] = json_encode($data);
        }
        
        $response = wp_remote_request($url, $args);
        
        if (is_wp_error($response)) {
            error_log('CDEK API Request Error: ' . $response->get_error_message());
            return false;
        }
        
        $body = wp_remote_retrieve_body($response);
        return json_decode($body, true);
    }
    
    /**
     * Get city by name using CDEK API
     */
    public function get_city_by_name($city_name) {
        $endpoint = 'location/cities';
        $params = array(
            'city' => $city_name,
            'country_codes' => 'RU',
            'size' => 1
        );
        
        $endpoint .= '?' . http_build_query($params);
        
        $response = $this->make_request($endpoint);
        
        if ($response && isset($response[0])) {
            return $response[0];
        }
        
        return false;
    }
    
    /**
     * Get pickup points by city
     */
    public function get_pickup_points($city_name) {
        $city = $this->get_city_by_name($city_name);
        
        if (!$city) {
            return false;
        }
        
        $endpoint = 'deliverypoints';
        $params = array(
            'city_code' => $city['code'],
            'type' => 'PVZ',
            'country_code' => 'RU'
        );
        
        $endpoint .= '?' . http_build_query($params);
        
        $response = $this->make_request($endpoint);
        
        return $response;
    }
    
    /**
     * Calculate delivery cost
     */
    public function calculate_delivery($from_city, $to_city, $packages) {
        $from_city_data = $this->get_city_by_name($from_city);
        $to_city_data = $this->get_city_by_name($to_city);
        
        if (!$from_city_data || !$to_city_data) {
            return false;
        }
        
        $data = array(
            'type' => 1, // Delivery type (1 - online store)
            'from_location' => array(
                'code' => $from_city_data['code']
            ),
            'to_location' => array(
                'code' => $to_city_data['code']
            ),
            'packages' => $packages
        );
        
        $response = $this->make_request('calculator/tarifflist', 'POST', $data);
        
        return $response;
    }
    
    /**
     * Create order
     */
    public function create_order($order_data) {
        $response = $this->make_request('orders', 'POST', $order_data);
        
        return $response;
    }
    
    /**
     * Get order info
     */
    public function get_order($cdek_order_uuid) {
        $endpoint = 'orders/' . $cdek_order_uuid;
        
        $response = $this->make_request($endpoint);
        
        return $response;
    }
}