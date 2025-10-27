<?php
/**
 * СДЭК API Handler для WordPress/WooCommerce
 * Обрабатывает запросы к API СДЭК для получения пунктов выдачи
 */

class CDEK_API_Handler {
    
    private $api_url = 'https://api.cdek.ru/v2/';
    private $client_id;
    private $client_secret;
    private $access_token;
    private $token_expires;
    
    public function __construct() {
        // Получаем настройки из WordPress
        $this->client_id = get_option('cdek_client_id');
        $this->client_secret = get_option('cdek_client_secret');
        
        // Регистрируем REST API endpoints
        add_action('rest_api_init', array($this, 'register_api_routes'));
        
        // Добавляем скрипты и стили
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        
        // Добавляем настройки в админку
        add_action('admin_init', array($this, 'admin_init'));
        add_action('admin_menu', array($this, 'admin_menu'));
    }
    
    /**
     * Регистрируем REST API маршруты
     */
    public function register_api_routes() {
        register_rest_route('cdek/v1', '/offices', array(
            'methods' => 'POST',
            'callback' => array($this, 'get_offices'),
            'permission_callback' => array($this, 'verify_nonce'),
            'args' => array(
                'city' => array(
                    'required' => true,
                    'type' => 'string',
                    'sanitize_callback' => 'sanitize_text_field'
                ),
                'type' => array(
                    'required' => false,
                    'type' => 'string',
                    'default' => 'PVZ'
                )
            )
        ));
        
        register_rest_route('cdek/v1', '/calculate', array(
            'methods' => 'POST',
            'callback' => array($this, 'calculate_delivery'),
            'permission_callback' => array($this, 'verify_nonce')
        ));
    }
    
    /**
     * Проверка nonce для безопасности
     */
    public function verify_nonce($request) {
        $nonce = $request->get_header('X-WP-Nonce');
        return wp_verify_nonce($nonce, 'wp_rest');
    }
    
    /**
     * Подключаем скрипты и стили
     */
    public function enqueue_scripts() {
        if (is_checkout()) {
            wp_enqueue_script(
                'cdek-map-integration',
                plugin_dir_url(__FILE__) . 'cdek-map-integration.js',
                array('jquery'),
                '1.0.0',
                true
            );
            
            // Передаем данные в JavaScript
            wp_localize_script('cdek-map-integration', 'cdekMapData', array(
                'apiUrl' => home_url('/wp-json/cdek/v1/'),
                'nonce' => wp_create_nonce('wp_rest'),
                'yandexApiKey' => get_option('cdek_yandex_api_key', ''),
                'currentCity' => $this->get_current_city()
            ));
        }
    }
    
    /**
     * Получение текущего города из адреса пользователя
     */
    private function get_current_city() {
        if (is_user_logged_in()) {
            $user_id = get_current_user_id();
            $city = get_user_meta($user_id, 'billing_city', true);
            if (!empty($city)) {
                return $city;
            }
        }
        
        // Попытка определить город по IP
        return $this->get_city_by_ip();
    }
    
    /**
     * Определение города по IP адресу
     */
    private function get_city_by_ip() {
        $ip = $this->get_client_ip();
        
        // Используем бесплатный сервис для определения города
        $response = wp_remote_get("http://ip-api.com/json/{$ip}?lang=ru&fields=city");
        
        if (!is_wp_error($response)) {
            $body = wp_remote_retrieve_body($response);
            $data = json_decode($body, true);
            
            if (isset($data['city'])) {
                return $data['city'];
            }
        }
        
        return 'Москва'; // Город по умолчанию
    }
    
    /**
     * Получение IP адреса клиента
     */
    private function get_client_ip() {
        $ip_keys = array('HTTP_CLIENT_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR');
        
        foreach ($ip_keys as $key) {
            if (array_key_exists($key, $_SERVER) === true) {
                foreach (explode(',', $_SERVER[$key]) as $ip) {
                    $ip = trim($ip);
                    if (filter_var($ip, FILTER_VALIDATE_IP, 
                        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false) {
                        return $ip;
                    }
                }
            }
        }
        
        return $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    }
    
    /**
     * Получение пунктов выдачи СДЭК
     */
    public function get_offices($request) {
        $city = $request->get_param('city');
        $type = $request->get_param('type');
        
        try {
            // Получаем токен доступа
            $this->get_access_token();
            
            // Получаем координаты города
            $city_coords = $this->get_city_coordinates($city);
            
            if (!$city_coords) {
                return new WP_Error('city_not_found', 'Город не найден', array('status' => 404));
            }
            
            // Запрос к API СДЭК для получения офисов
            $offices_data = $this->fetch_cdek_offices($city_coords, $type);
            
            if (is_wp_error($offices_data)) {
                return $offices_data;
            }
            
            // Форматируем данные для фронтенда
            $formatted_offices = $this->format_offices_data($offices_data);
            
            return rest_ensure_response($formatted_offices);
            
        } catch (Exception $e) {
            return new WP_Error('api_error', $e->getMessage(), array('status' => 500));
        }
    }
    
    /**
     * Получение токена доступа к API СДЭК
     */
    private function get_access_token() {
        // Проверяем, есть ли действующий токен
        $stored_token = get_transient('cdek_access_token');
        
        if ($stored_token) {
            $this->access_token = $stored_token;
            return;
        }
        
        // Запрашиваем новый токен
        $response = wp_remote_post($this->api_url . 'oauth/token', array(
            'headers' => array(
                'Content-Type' => 'application/x-www-form-urlencoded'
            ),
            'body' => array(
                'grant_type' => 'client_credentials',
                'client_id' => $this->client_id,
                'client_secret' => $this->client_secret
            )
        ));
        
        if (is_wp_error($response)) {
            throw new Exception('Ошибка подключения к API СДЭК: ' . $response->get_error_message());
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (!isset($data['access_token'])) {
            throw new Exception('Не удалось получить токен доступа СДЭК');
        }
        
        $this->access_token = $data['access_token'];
        
        // Сохраняем токен в кеше
        set_transient('cdek_access_token', $this->access_token, $data['expires_in'] - 60);
    }
    
    /**
     * Получение координат города
     */
    private function get_city_coordinates($city) {
        // Используем API Яндекс.Карт для геокодирования
        $yandex_api_key = get_option('cdek_yandex_api_key');
        
        if (empty($yandex_api_key)) {
            // Если нет ключа Яндекс, используем бесплатный сервис
            return $this->get_coordinates_free($city);
        }
        
        $url = "https://geocode-maps.yandex.ru/1.x/?apikey={$yandex_api_key}&geocode=" . urlencode($city) . "&format=json";
        
        $response = wp_remote_get($url);
        
        if (is_wp_error($response)) {
            return null;
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (isset($data['response']['GeoObjectCollection']['featureMember'][0])) {
            $coords = $data['response']['GeoObjectCollection']['featureMember'][0]['GeoObject']['Point']['pos'];
            $coords_array = explode(' ', $coords);
            return array(
                'longitude' => floatval($coords_array[0]),
                'latitude' => floatval($coords_array[1])
            );
        }
        
        return null;
    }
    
    /**
     * Получение координат через бесплатный сервис
     */
    private function get_coordinates_free($city) {
        $response = wp_remote_get("http://nominatim.openstreetmap.org/search?q=" . urlencode($city) . "&format=json&limit=1");
        
        if (is_wp_error($response)) {
            return null;
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (!empty($data) && isset($data[0]['lat'], $data[0]['lon'])) {
            return array(
                'latitude' => floatval($data[0]['lat']),
                'longitude' => floatval($data[0]['lon'])
            );
        }
        
        return null;
    }
    
    /**
     * Получение офисов СДЭК через API
     */
    private function fetch_cdek_offices($coordinates, $type = 'PVZ') {
        $url = $this->api_url . 'deliverypoints';
        
        $params = array(
            'type' => $type,
            'city_code' => null, // Будем искать по координатам
            'country_code' => 'RU'
        );
        
        // Если есть координаты, добавляем их для поиска в радиусе
        if ($coordinates) {
            $params['longitude'] = $coordinates['longitude'];
            $params['latitude'] = $coordinates['latitude'];
        }
        
        $url .= '?' . http_build_query($params);
        
        $response = wp_remote_get($url, array(
            'headers' => array(
                'Authorization' => 'Bearer ' . $this->access_token,
                'Content-Type' => 'application/json'
            )
        ));
        
        if (is_wp_error($response)) {
            return new WP_Error('cdek_api_error', 'Ошибка API СДЭК: ' . $response->get_error_message());
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (!$data) {
            return new WP_Error('cdek_api_error', 'Некорректный ответ от API СДЭК');
        }
        
        return $data;
    }
    
    /**
     * Форматирование данных офисов для фронтенда
     */
    private function format_offices_data($offices_data) {
        $formatted = array();
        
        foreach ($offices_data as $office) {
            $formatted[] = array(
                'code' => $office['code'],
                'name' => $office['name'],
                'address' => $this->format_address($office['location']),
                'coordinates' => array(
                    floatval($office['location']['latitude']),
                    floatval($office['location']['longitude'])
                ),
                'workTime' => $this->format_work_time($office['work_time']),
                'phone' => $office['phone'] ?? '',
                'type' => $office['type'],
                'services' => $office['services'] ?? array()
            );
        }
        
        return $formatted;
    }
    
    /**
     * Форматирование адреса
     */
    private function format_address($location) {
        $address_parts = array();
        
        if (!empty($location['address'])) {
            $address_parts[] = $location['address'];
        }
        
        if (!empty($location['address_comment'])) {
            $address_parts[] = $location['address_comment'];
        }
        
        return implode(', ', $address_parts);
    }
    
    /**
     * Форматирование времени работы
     */
    private function format_work_time($work_time) {
        if (empty($work_time)) {
            return 'Время работы уточняйте';
        }
        
        $formatted_time = array();
        
        foreach ($work_time as $schedule) {
            $day = $schedule['day'];
            $periods = $schedule['time'];
            
            $day_name = $this->get_day_name($day);
            
            if (empty($periods)) {
                $formatted_time[] = $day_name . ': выходной';
            } else {
                $time_ranges = array();
                foreach ($periods as $period) {
                    $time_ranges[] = $period['from'] . '-' . $period['to'];
                }
                $formatted_time[] = $day_name . ': ' . implode(', ', $time_ranges);
            }
        }
        
        return implode('; ', $formatted_time);
    }
    
    /**
     * Получение названия дня недели
     */
    private function get_day_name($day) {
        $days = array(
            1 => 'Пн',
            2 => 'Вт', 
            3 => 'Ср',
            4 => 'Чт',
            5 => 'Пт',
            6 => 'Сб',
            7 => 'Вс'
        );
        
        return $days[$day] ?? 'День ' . $day;
    }
    
    /**
     * Расчет стоимости доставки
     */
    public function calculate_delivery($request) {
        // Здесь можно добавить логику расчета стоимости доставки
        // на основе выбранного пункта выдачи
        
        return rest_ensure_response(array(
            'success' => true,
            'message' => 'Расчет доставки выполнен'
        ));
    }
    
    /**
     * Инициализация админки
     */
    public function admin_init() {
        register_setting('cdek_settings', 'cdek_client_id');
        register_setting('cdek_settings', 'cdek_client_secret');
        register_setting('cdek_settings', 'cdek_yandex_api_key');
        
        add_settings_section(
            'cdek_main_settings',
            'Основные настройки СДЭК',
            array($this, 'settings_section_callback'),
            'cdek_settings'
        );
        
        add_settings_field(
            'cdek_client_id',
            'Client ID СДЭК',
            array($this, 'client_id_callback'),
            'cdek_settings',
            'cdek_main_settings'
        );
        
        add_settings_field(
            'cdek_client_secret',
            'Client Secret СДЭК',
            array($this, 'client_secret_callback'),
            'cdek_settings',
            'cdek_main_settings'
        );
        
        add_settings_field(
            'cdek_yandex_api_key',
            'API ключ Яндекс.Карт',
            array($this, 'yandex_api_key_callback'),
            'cdek_settings',
            'cdek_main_settings'
        );
    }
    
    /**
     * Добавление страницы в админку
     */
    public function admin_menu() {
        add_options_page(
            'Настройки СДЭК',
            'СДЭК',
            'manage_options',
            'cdek_settings',
            array($this, 'admin_page')
        );
    }
    
    /**
     * Отображение страницы настроек
     */
    public function admin_page() {
        ?>
        <div class="wrap">
            <h1>Настройки СДЭК</h1>
            <form method="post" action="options.php">
                <?php
                settings_fields('cdek_settings');
                do_settings_sections('cdek_settings');
                submit_button();
                ?>
            </form>
            
            <h2>Инструкция по настройке</h2>
            <ol>
                <li>Зарегистрируйтесь в <a href="https://www.cdek.ru/ru/integration" target="_blank">личном кабинете СДЭК</a></li>
                <li>Получите Client ID и Client Secret для API</li>
                <li>Получите API ключ для <a href="https://developer.tech.yandex.ru/" target="_blank">Яндекс.Карт</a></li>
                <li>Введите полученные данные в поля выше</li>
            </ol>
        </div>
        <?php
    }
    
    public function settings_section_callback() {
        echo '<p>Введите данные для подключения к API СДЭК и Яндекс.Карт</p>';
    }
    
    public function client_id_callback() {
        $value = get_option('cdek_client_id');
        echo '<input type="text" name="cdek_client_id" value="' . esc_attr($value) . '" class="regular-text" />';
    }
    
    public function client_secret_callback() {
        $value = get_option('cdek_client_secret');
        echo '<input type="password" name="cdek_client_secret" value="' . esc_attr($value) . '" class="regular-text" />';
    }
    
    public function yandex_api_key_callback() {
        $value = get_option('cdek_yandex_api_key');
        echo '<input type="text" name="cdek_yandex_api_key" value="' . esc_attr($value) . '" class="regular-text" />';
        echo '<p class="description">API ключ для Яндекс.Карт (необязательно, но рекомендуется)</p>';
    }
}

// Инициализируем класс
new CDEK_API_Handler();