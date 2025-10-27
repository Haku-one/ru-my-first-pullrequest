jQuery(document).ready(function($) {
    'use strict';
    
    var CDEKMap = {
        map: null,
        clusterer: null,
        currentPickupPoints: [],
        selectedPoint: null,
        isMapInitialized: false,
        
        init: function() {
            console.log('CDEK Map: Initializing...');
            this.hideFields();
            this.bindEvents();
            this.loadYandexMaps();
            this.checkShippingMethod();
        },
        
        loadYandexMaps: function() {
            var self = this;
            console.log('CDEK Map: Loading Yandex Maps API...');
            
            if (window.ymaps) {
                console.log('CDEK Map: Yandex Maps already loaded');
                ymaps.ready(function() {
                    console.log('CDEK Map: Yandex Maps ready');
                    self.isMapInitialized = true;
                });
                return;
            }
            
            // Загружаем API Яндекс.Карт
            var script = document.createElement('script');
            var apiKey = (typeof cdek_ajax !== 'undefined' && cdek_ajax.yandex_api_key) ? 
                '&apikey=' + cdek_ajax.yandex_api_key : '';
            script.src = 'https://api-maps.yandex.ru/2.1/?lang=ru_RU' + apiKey;
            script.onload = function() {
                console.log('CDEK Map: Yandex Maps script loaded');
                ymaps.ready(function() {
                    console.log('CDEK Map: Yandex Maps ready');
                    self.isMapInitialized = true;
                    // Если контейнер уже создан, инициализируем карту
                    if ($('#cdek-yandex-map').length > 0) {
                        self.createMap();
                    }
                });
            };
            script.onerror = function() {
                console.error('CDEK Map: Failed to load Yandex Maps API');
            };
            document.head.appendChild(script);
        },
        
        hideFields: function() {
            // Hide unnecessary fields in both classic and block checkout
            $('.wc-block-components-address-form__city').hide();
            $('.wc-block-components-address-form__state').hide();
            $('.wc-block-components-address-form__postcode').hide();
            
            // For classic checkout
            $('#shipping_city_field, #shipping_state_field, #shipping_postcode_field').hide();
            $('#billing_city_field, #billing_state_field, #billing_postcode_field').hide();
        },
        
        bindEvents: function() {
            var self = this;
            
            // Monitor address changes
            $(document).on('change keyup', '#shipping-address_1, #shipping_address_1', function() {
                self.handleAddressChange($(this).val());
            });
            
            // Monitor shipping method changes
            $(document).on('change', 'input[name^="shipping_method"]', function() {
                setTimeout(function() {
                    self.checkShippingMethod();
                }, 100);
            });
            
            // For checkout updates
            $(document).on('updated_checkout', function() {
                console.log('CDEK Map: Checkout updated');
                setTimeout(function() {
                    self.hideFields();
                    self.checkShippingMethod();
                }, 200);
            });
            
            $('body').on('updated_checkout', function() {
                console.log('CDEK Map: Body checkout updated');
                setTimeout(function() {
                    self.hideFields();
                    self.checkShippingMethod();
                }, 200);
            });
            
            // Обработчик переключения между списком и картой
            $(document).on('click', '.cdek-view-toggle button', function() {
                var viewType = $(this).data('view');
                self.switchView(viewType);
                
                $('.cdek-view-toggle button').removeClass('active');
                $(this).addClass('active');
            });
            
            // Обработчик поиска города
            $(document).on('click', '#cdek-city-search-btn', function() {
                var city = $('#cdek-city-search').val();
                if (city) {
                    self.loadPickupPoints(city);
                }
            });
            
            $(document).on('keypress', '#cdek-city-search', function(e) {
                if (e.which === 13) {
                    e.preventDefault();
                    var city = $(this).val();
                    if (city) {
                        self.loadPickupPoints(city);
                    }
                }
            });
        },
        
        handleAddressChange: function(address) {
            var city = this.extractCityFromAddress(address);
            
            if (city && city.length > 2) {
                // Обновляем поле поиска города
                $('#cdek-city-search').val(city);
                this.loadPickupPoints(city);
            } else {
                this.hidePickupPoints();
            }
        },
        
        extractCityFromAddress: function(address) {
            if (!address) return '';
            
            var parts = address.split(',');
            
            for (var i = 0; i < parts.length; i++) {
                var part = parts[i].trim();
                
                // Remove common prefixes
                part = part.replace(/^(г\.|город|пос\.|поселок|с\.|село)\s*/gi, '');
                
                // Check if it looks like a city name (Cyrillic letters, spaces, hyphens)
                if (/^[а-яё\s\-]+$/i.test(part) && part.length > 2) {
                    return part.trim();
                }
            }
            
            return '';
        },
        
        checkShippingMethod: function() {
            console.log('CDEK Map: Checking shipping method...');
            
            var selectedMethod = $('input[name^="shipping_method"]:checked').val();
            console.log('CDEK Map: Selected method:', selectedMethod);
            
            if (selectedMethod && selectedMethod.indexOf('cdek_shipping') !== -1) {
                console.log('CDEK Map: CDEK shipping selected, showing container');
                this.showPickupPointsContainer();
                
                // Get city from address
                var address = $('#shipping-address_1').val() || $('#shipping_address_1').val() || 'Москва';
                console.log('CDEK Map: Address:', address);
                
                if (address) {
                    this.handleAddressChange(address);
                } else {
                    // Загружаем Москву по умолчанию
                    this.loadPickupPoints('Москва');
                }
            } else {
                console.log('CDEK Map: CDEK shipping not selected, hiding container');
                this.hidePickupPointsContainer();
            }
        },
        
        showPickupPointsContainer: function() {
            console.log('CDEK Map: Showing pickup points container');
            
            if ($('#cdek-pickup-points').length === 0) {
                this.createPickupPointsContainer();
            }
            $('#cdek-pickup-points').addClass('show').show();
        },
        
        hidePickupPointsContainer: function() {
            console.log('CDEK Map: Hiding pickup points container');
            $('#cdek-pickup-points').removeClass('show').hide();
        },
        
        createPickupPointsContainer: function() {
            console.log('CDEK Map: Creating pickup points container');
            
            var container = $('<div id="cdek-pickup-points" class="cdek-pickup-points">' +
                '<div class="cdek-header">' +
                    '<h4>🗺️ Выберите пункт выдачи CDEK</h4>' +
                    '<div class="cdek-city-search">' +
                        '<input type="text" id="cdek-city-search" placeholder="Введите город..." value="Москва" />' +
                        '<button type="button" id="cdek-city-search-btn">🔍 Найти</button>' +
                    '</div>' +
                '</div>' +
                '<div class="cdek-view-toggle">' +
                    '<button type="button" data-view="list" class="active">📋 Список</button>' +
                    '<button type="button" data-view="map">🗺️ Карта</button>' +
                '</div>' +
                '<div id="cdek-pickup-list" class="cdek-pickup-list">' +
                    '<div class="cdek-loading">🔄 Загрузка пунктов выдачи...</div>' +
                '</div>' +
                '<div id="cdek-pickup-map" class="cdek-pickup-map" style="display: none;">' +
                    '<div id="cdek-yandex-map" class="cdek-map-container"></div>' +
                '</div>' +
                '<div id="cdek-selected-point" class="cdek-selected-point" style="display: none;">' +
                    '<h5>✅ Выбранный пункт выдачи:</h5>' +
                    '<div class="cdek-selected-info"></div>' +
                '</div>' +
                '</div>');
            
            // Ищем место для вставки
            var insertAfter = $('.wc-block-components-shipping-rates-control, .woocommerce-shipping-methods, #shipping_method');
            
            if (insertAfter.length > 0) {
                console.log('CDEK Map: Inserting after shipping methods');
                insertAfter.last().after(container);
            } else {
                // Fallback: insert in shipping section
                var fallbackTarget = $('.wc-block-components-address-form, .woocommerce-shipping-fields, .wc-block-checkout__shipping-fields');
                if (fallbackTarget.length > 0) {
                    console.log('CDEK Map: Inserting in shipping section (fallback)');
                    fallbackTarget.last().after(container);
                } else {
                    // Last resort: append to form
                    console.log('CDEK Map: Inserting in form (last resort)');
                    $('.wc-block-components-form, .checkout.woocommerce-checkout').first().append(container);
                }
            }
            
            // Автоматически загружаем Москву
            setTimeout(() => {
                this.loadPickupPoints('Москва');
            }, 500);
        },
        
        switchView: function(viewType) {
            console.log('CDEK Map: Switching to view:', viewType);
            
            if (viewType === 'map') {
                $('#cdek-pickup-list').hide();
                $('#cdek-pickup-map').show();
                
                // Инициализируем карту если еще не создана
                if (!this.map && this.isMapInitialized) {
                    this.createMap();
                }
                
                // Отображаем точки на карте
                if (this.currentPickupPoints.length > 0) {
                    setTimeout(() => {
                        this.displayPointsOnMap(this.currentPickupPoints);
                    }, 100);
                }
            } else {
                $('#cdek-pickup-map').hide();
                $('#cdek-pickup-list').show();
            }
        },
        
        createMap: function() {
            console.log('CDEK Map: Creating map...');
            
            if (!window.ymaps || this.map || !$('#cdek-yandex-map').length) {
                console.log('CDEK Map: Cannot create map - missing requirements');
                return;
            }
            
            try {
                // Создаем карту с центром в Москве по умолчанию
                this.map = new ymaps.Map('cdek-yandex-map', {
                    center: [55.7558, 37.6176], // Москва
                    zoom: 10,
                    controls: ['zoomControl', 'fullscreenControl', 'geolocationControl']
                });
                
                // Создаем кластеризатор
                this.clusterer = new ymaps.Clusterer({
                    preset: 'islands#invertedVioletClusterIcons',
                    groupByCoordinates: false,
                    clusterDisableClickZoom: false,
                    clusterHideIconOnBalloonOpen: false,
                    geoObjectHideIconOnBalloonOpen: false
                });
                
                this.map.geoObjects.add(this.clusterer);
                console.log('CDEK Map: Map created successfully');
                
                // Если есть точки, отображаем их
                if (this.currentPickupPoints.length > 0) {
                    this.displayPointsOnMap(this.currentPickupPoints);
                }
            } catch (error) {
                console.error('CDEK Map: Error creating map:', error);
            }
        },
        
        loadPickupPoints: function(city) {
            console.log('CDEK Map: Loading pickup points for city:', city);
            
            var self = this;
            var $list = $('#cdek-pickup-list');
            
            if (!$list.length) {
                console.log('CDEK Map: Pickup list container not found');
                return;
            }
            
            $list.html('<div class="cdek-loading">🔄 Загрузка пунктов выдачи для города "' + city + '"...</div>');
            
            // Если есть AJAX, используем его
            if (typeof cdek_ajax !== 'undefined') {
                $.ajax({
                    url: cdek_ajax.ajax_url,
                    type: 'POST',
                    data: {
                        action: 'cdek_get_pickup_points',
                        city: city,
                        nonce: cdek_ajax.nonce
                    },
                    success: function(response) {
                        console.log('CDEK Map: AJAX response:', response);
                        if (response.success && response.data) {
                            self.currentPickupPoints = response.data;
                            self.displayPickupPoints(response.data);
                            
                            // Центрируем карту на городе если карта активна
                            if ($('#cdek-pickup-map').is(':visible') && self.map) {
                                self.centerMapOnCity(city);
                                self.displayPointsOnMap(response.data);
                            }
                        } else {
                            console.log('CDEK Map: No data received, using test data');
                            self.useTestData(city);
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('CDEK Map: AJAX error:', error);
                        self.useTestData(city);
                    }
                });
            } else {
                console.log('CDEK Map: No AJAX available, using test data');
                self.useTestData(city);
            }
        },
        
        useTestData: function(city) {
            console.log('CDEK Map: Using test data for city:', city);
            
            // Используем тестовые данные
            var testPoints = this.getTestOffices(city);
            this.currentPickupPoints = testPoints;
            this.displayPickupPoints(testPoints);
            
            // Центрируем карту на городе если карта активна
            if ($('#cdek-pickup-map').is(':visible') && this.map) {
                this.centerMapOnCity(city);
                this.displayPointsOnMap(testPoints);
            }
        },
        
        getTestOffices: function(city) {
            var cityCoords = {
                'Москва': [55.7558, 37.6176],
                'Санкт-Петербург': [59.9311, 30.3609],
                'Екатеринбург': [56.8431, 60.6454],
                'Новосибирск': [55.0084, 82.9357],
                'Махачкала': [42.9849, 47.5047]
            };
            
            var baseCoords = cityCoords[city] || cityCoords['Москва'];
            
            return [
                {
                    code: city + '1',
                    name: 'СДЭК Центральный',
                    location: {
                        address_full: 'ул. Центральная, 1',
                        latitude: baseCoords[0] + 0.01,
                        longitude: baseCoords[1] + 0.01
                    },
                    work_time: 'Пн-Пт: 9:00-18:00, Сб: 10:00-16:00',
                    phone: '+7 (495) 123-45-67'
                },
                {
                    code: city + '2',
                    name: 'СДЭК на Ленина',
                    location: {
                        address_full: 'пр. Ленина, 15',
                        latitude: baseCoords[0] - 0.01,
                        longitude: baseCoords[1] + 0.02
                    },
                    work_time: 'Пн-Вс: 10:00-20:00',
                    phone: '+7 (495) 234-56-78'
                },
                {
                    code: city + '3',
                    name: 'СДЭК в ТЦ Мега',
                    location: {
                        address_full: 'ТЦ Мега, 1 этаж',
                        latitude: baseCoords[0] + 0.02,
                        longitude: baseCoords[1] - 0.01
                    },
                    work_time: 'Пн-Вс: 10:00-22:00',
                    phone: '+7 (495) 345-67-89'
                }
            ];
        },
        
        centerMapOnCity: function(cityName) {
            if (!this.map || !window.ymaps) return;
            
            console.log('CDEK Map: Centering map on city:', cityName);
            
            var cityCoords = {
                'Москва': [55.7558, 37.6176],
                'Санкт-Петербург': [59.9311, 30.3609],
                'Екатеринбург': [56.8431, 60.6454],
                'Новосибирск': [55.0084, 82.9357],
                'Махачкала': [42.9849, 47.5047]
            };
            
            var coords = cityCoords[cityName] || cityCoords['Москва'];
            this.map.setCenter(coords, 11);
        },
        
        displayPointsOnMap: function(pickupPoints) {
            if (!this.map || !this.clusterer) {
                console.log('CDEK Map: Map not ready for displaying points');
                return;
            }
            
            console.log('CDEK Map: Displaying points on map:', pickupPoints.length);
            
            // Очищаем кластеризатор
            this.clusterer.removeAll();
            
            var self = this;
            var placemarks = [];
            
            for (var i = 0; i < pickupPoints.length; i++) {
                var point = pickupPoints[i];
                
                if (point.location && point.location.latitude && point.location.longitude) {
                    var coords = [parseFloat(point.location.latitude), parseFloat(point.location.longitude)];
                    
                    var placemark = new ymaps.Placemark(coords, {
                        balloonContentHeader: point.name || 'Пункт выдачи CDEK',
                        balloonContentBody: 
                            '<div class="cdek-balloon">' +
                            '<p><strong>📍 Адрес:</strong> ' + point.location.address_full + '</p>' +
                            '<p><strong>🕒 Режим работы:</strong> ' + (point.work_time || 'Уточняйте') + '</p>' +
                            '<p><strong>📞 Телефон:</strong> ' + (point.phone || 'Не указан') + '</p>' +
                            '<button class="cdek-select-btn" data-code="' + point.code + '">✅ Выбрать этот пункт</button>' +
                            '</div>',
                        balloonContentFooter: 'Код: ' + point.code
                    }, {
                        preset: 'islands#violetDotIconWithCaption',
                        iconCaptionMaxWidth: '200'
                    });
                    
                    // Обработчик клика по метке
                    placemark.events.add('click', function() {
                        var clickedCoords = this.geometry.getCoordinates();
                        var foundPoint = null;
                        
                        for (var j = 0; j < pickupPoints.length; j++) {
                            if (pickupPoints[j].location && 
                                Math.abs(parseFloat(pickupPoints[j].location.latitude) - clickedCoords[0]) < 0.0001 &&
                                Math.abs(parseFloat(pickupPoints[j].location.longitude) - clickedCoords[1]) < 0.0001) {
                                foundPoint = pickupPoints[j];
                                break;
                            }
                        }
                        
                        if (foundPoint) {
                            self.selectPickupPoint(foundPoint);
                        }
                    });
                    
                    placemarks.push(placemark);
                }
            }
            
            if (placemarks.length > 0) {
                this.clusterer.add(placemarks);
                
                // Автоматически подстраиваем масштаб карты под все точки
                try {
                    this.map.setBounds(this.clusterer.getBounds(), {
                        checkZoomRange: true,
                        zoomMargin: 20
                    });
                } catch (e) {
                    console.log('CDEK Map: Could not auto-fit bounds');
                }
            }
            
            // Обработчик кнопок в балунах
            $(document).off('click', '.cdek-select-btn').on('click', '.cdek-select-btn', function() {
                var code = $(this).data('code');
                var point = self.findPointByCode(code);
                if (point) {
                    self.selectPickupPoint(point);
                }
            });
        },
        
        findPointByCode: function(code) {
            for (var i = 0; i < this.currentPickupPoints.length; i++) {
                if (this.currentPickupPoints[i].code === code) {
                    return this.currentPickupPoints[i];
                }
            }
            return null;
        },
        
        selectPickupPoint: function(point) {
            console.log('CDEK Map: Selected point:', point);
            
            this.selectedPoint = point;
            
            // Обновляем выбранную точку в списке
            $('.cdek-pickup-item').removeClass('selected');
            $('.cdek-pickup-item[data-code="' + point.code + '"]').addClass('selected');
            $('.cdek-pickup-item[data-code="' + point.code + '"] input[type="radio"]').prop('checked', true);
            
            // Показываем информацию о выбранной точке
            $('#cdek-selected-point .cdek-selected-info').html(
                '<strong>📍 ' + (point.name || 'Пункт выдачи CDEK') + '</strong><br>' +
                '🏠 ' + point.location.address_full + '<br>' +
                '🕒 ' + (point.work_time || 'Время работы уточняйте') + '<br>' +
                '📞 ' + (point.phone || 'Телефон не указан')
            );
            $('#cdek-selected-point').show();
            
            // Центрируем карту на выбранной точке
            if (this.map && point.location && point.location.latitude && point.location.longitude) {
                var coords = [parseFloat(point.location.latitude), parseFloat(point.location.longitude)];
                this.map.setCenter(coords, 15);
            }
            
            // Обновляем checkout
            $('body').trigger('update_checkout');
            
            // Показываем уведомление
            this.showNotification('✅ Выбран пункт выдачи: ' + (point.name || 'CDEK'));
        },
        
        showNotification: function(message) {
            var notification = $('<div class="cdek-notification">' + message + '</div>');
            $('body').append(notification);
            
            setTimeout(function() {
                notification.fadeOut(function() {
                    notification.remove();
                });
            }, 3000);
        },
        
        displayPickupPoints: function(pickupPoints) {
            console.log('CDEK Map: Displaying pickup points list:', pickupPoints.length);
            
            var $list = $('#cdek-pickup-list');
            var html = '';
            
            if (!pickupPoints || pickupPoints.length === 0) {
                $list.html('<div class="cdek-error">❌ Пункты выдачи не найдены</div>');
                return;
            }
            
            for (var i = 0; i < pickupPoints.length; i++) {
                var point = pickupPoints[i];
                
                html += '<div class="cdek-pickup-item" data-code="' + point.code + '">' +
                    '<input type="radio" name="cdek_pickup_point" value="' + point.code + '" id="pickup_' + point.code + '">' +
                    '<label for="pickup_' + point.code + '">' +
                    '<div class="cdek-pickup-name">📍 ' + (point.name || 'Пункт выдачи CDEK') + '</div>' +
                    '<div class="cdek-pickup-address">🏠 ' + point.location.address_full + '</div>' +
                    '<div class="cdek-pickup-schedule">🕒 ' + (point.work_time || 'Время работы уточняйте') + '</div>' +
                    '<div class="cdek-pickup-phone">📞 ' + (point.phone || 'Телефон не указан') + '</div>' +
                    '</label>' +
                    '</div>';
            }
            
            $list.html(html);
            
            var self = this;
            
            // Bind click events
            $('.cdek-pickup-item').on('click', function() {
                var code = $(this).data('code');
                var point = self.findPointByCode(code);
                if (point) {
                    self.selectPickupPoint(point);
                }
            });
        },
        
        hidePickupPoints: function() {
            $('#cdek-pickup-list').empty();
            $('#cdek-selected-point').hide();
        }
    };
    
    // Initialize
    console.log('CDEK Map: Document ready, initializing...');
    CDEKMap.init();
    
    // Re-initialize on checkout updates
    $(document).on('updated_checkout', function() {
        console.log('CDEK Map: Re-initializing after checkout update...');
        setTimeout(function() {
            CDEKMap.init();
        }, 300);
    });
    
    // For block checkout
    if (typeof wp !== 'undefined' && wp.hooks) {
        wp.hooks.addAction('experimental__woocommerce_blocks-checkout-render-checkout-form', 'cdek-shipping', function() {
            console.log('CDEK Map: Block checkout rendered, initializing...');
            setTimeout(function() {
                CDEKMap.init();
            }, 500);
        });
    }
    
    // Expose for debugging
    window.CDEKMap = CDEKMap;
});