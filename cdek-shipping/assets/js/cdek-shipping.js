jQuery(document).ready(function($) {
    'use strict';
    
    var cdekShipping = {
        map: null,
        clusterer: null,
        currentPickupPoints: [],
        selectedPoint: null,
        
        init: function() {
            this.hideFields();
            this.bindEvents();
            this.checkShippingMethod();
            this.loadYandexMaps();
        },
        
        loadYandexMaps: function() {
            var self = this;
            
            if (window.ymaps) {
                ymaps.ready(function() {
                    self.initMap();
                });
                return;
            }
            
            // Загружаем API Яндекс.Карт
            var script = document.createElement('script');
            var apiKey = cdek_ajax.yandex_api_key ? '&apikey=' + cdek_ajax.yandex_api_key : '';
            script.src = 'https://api-maps.yandex.ru/2.1/?lang=ru_RU' + apiKey;
            script.onload = function() {
                ymaps.ready(function() {
                    self.initMap();
                });
            };
            document.head.appendChild(script);
        },
        
        initMap: function() {
            // Карта будет инициализирована при первом отображении
            console.log('Yandex Maps API loaded');
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
                self.checkShippingMethod();
            });
            
            // For block checkout
            $(document).on('updated_checkout', function() {
                self.hideFields();
                self.checkShippingMethod();
            });
            
            // For classic checkout
            $('body').on('updated_checkout', function() {
                self.hideFields();
                self.checkShippingMethod();
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
            var selectedMethod = $('input[name^="shipping_method"]:checked').val();
            
            if (selectedMethod && selectedMethod.indexOf('cdek_shipping') !== -1) {
                this.showPickupPointsContainer();
                
                // Get city from address
                var address = $('#shipping-address_1').val() || $('#shipping_address_1').val();
                if (address) {
                    this.handleAddressChange(address);
                }
            } else {
                this.hidePickupPointsContainer();
            }
        },
        
        showPickupPointsContainer: function() {
            if ($('#cdek-pickup-points').length === 0) {
                this.createPickupPointsContainer();
            }
            $('#cdek-pickup-points').addClass('show');
        },
        
        hidePickupPointsContainer: function() {
            $('#cdek-pickup-points').removeClass('show');
        },
        
        createPickupPointsContainer: function() {
            var container = $('<div id="cdek-pickup-points" class="cdek-pickup-points">' +
                '<div class="cdek-header">' +
                    '<h4>Выберите пункт выдачи CDEK</h4>' +
                    '<div class="cdek-city-search">' +
                        '<input type="text" id="cdek-city-search" placeholder="Введите город..." />' +
                        '<button type="button" id="cdek-city-search-btn">Найти</button>' +
                    '</div>' +
                '</div>' +
                '<div class="cdek-view-toggle">' +
                    '<button type="button" data-view="list" class="active">Список</button>' +
                    '<button type="button" data-view="map">Карта</button>' +
                '</div>' +
                '<div id="cdek-pickup-list" class="cdek-pickup-list"></div>' +
                '<div id="cdek-pickup-map" class="cdek-pickup-map" style="display: none;">' +
                    '<div id="cdek-yandex-map" class="cdek-map-container"></div>' +
                '</div>' +
                '<div id="cdek-selected-point" class="cdek-selected-point" style="display: none;">' +
                    '<h5>Выбранный пункт выдачи:</h5>' +
                    '<div class="cdek-selected-info"></div>' +
                '</div>' +
                '</div>');
            
            // Try to insert after shipping methods
            var insertAfter = $('.wc-block-components-shipping-rates-control, .woocommerce-shipping-methods, #shipping_method');
            
            if (insertAfter.length > 0) {
                insertAfter.last().after(container);
            } else {
                // Fallback: insert in shipping section
                $('.wc-block-components-address-form, .woocommerce-shipping-fields').append(container);
            }
        },
        
        switchView: function(viewType) {
            if (viewType === 'map') {
                $('#cdek-pickup-list').hide();
                $('#cdek-pickup-map').show();
                
                // Инициализируем карту если еще не создана
                if (!this.map && window.ymaps) {
                    this.createMap();
                }
                
                // Отображаем точки на карте
                if (this.currentPickupPoints.length > 0) {
                    this.displayPointsOnMap(this.currentPickupPoints);
                }
            } else {
                $('#cdek-pickup-map').hide();
                $('#cdek-pickup-list').show();
            }
        },
        
        createMap: function() {
            var self = this;
            
            if (!window.ymaps || this.map) return;
            
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
        },
        
        loadPickupPoints: function(city) {
            var self = this;
            var $list = $('#cdek-pickup-list');
            
            if (!$list.length) return;
            
            $list.html('<div class="cdek-loading"><div class="cdek-spinner"></div>Загрузка пунктов выдачи...</div>');
            
            $.ajax({
                url: cdek_ajax.ajax_url,
                type: 'POST',
                data: {
                    action: 'cdek_get_pickup_points',
                    city: city,
                    nonce: cdek_ajax.nonce
                },
                success: function(response) {
                    if (response.success && response.data) {
                        self.currentPickupPoints = response.data;
                        self.displayPickupPoints(response.data);
                        
                        // Центрируем карту на городе если карта активна
                        if ($('#cdek-pickup-map').is(':visible') && self.map) {
                            self.centerMapOnCity(city);
                            self.displayPointsOnMap(response.data);
                        }
                    } else {
                        $list.html('<div class="cdek-error">Пункты выдачи не найдены для города "' + city + '"</div>');
                    }
                },
                error: function() {
                    $list.html('<div class="cdek-error">Ошибка при загрузке пунктов выдачи</div>');
                }
            });
        },
        
        centerMapOnCity: function(cityName) {
            var self = this;
            
            if (!window.ymaps || !this.map) return;
            
            ymaps.geocode(cityName).then(function(result) {
                var firstGeoObject = result.geoObjects.get(0);
                if (firstGeoObject) {
                    var coords = firstGeoObject.geometry.getCoordinates();
                    self.map.setCenter(coords, 11);
                }
            });
        },
        
        displayPointsOnMap: function(pickupPoints) {
            if (!this.map || !this.clusterer) return;
            
            // Очищаем кластеризатор
            this.clusterer.removeAll();
            
            var self = this;
            var placemarks = [];
            
            for (var i = 0; i < pickupPoints.length; i++) {
                var point = pickupPoints[i];
                
                if (point.location && point.location.latitude && point.location.longitude) {
                    var coords = [parseFloat(point.location.latitude), parseFloat(point.location.longitude)];
                    var schedule = this.formatSchedule(point.work_time);
                    
                    var placemark = new ymaps.Placemark(coords, {
                        balloonContentHeader: point.name || 'Пункт выдачи CDEK',
                        balloonContentBody: 
                            '<div class="cdek-balloon">' +
                            '<p><strong>Адрес:</strong> ' + point.location.address_full + '</p>' +
                            '<p><strong>Режим работы:</strong> ' + schedule + '</p>' +
                            '<button class="cdek-select-btn" data-code="' + point.code + '">Выбрать этот пункт</button>' +
                            '</div>',
                        balloonContentFooter: 'Код: ' + point.code
                    }, {
                        preset: 'islands#violetDotIconWithCaption',
                        iconCaptionMaxWidth: '200'
                    });
                    
                    // Обработчик клика по метке
                    placemark.events.add('click', function() {
                        // Находим точку по координатам
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
                this.map.setBounds(this.clusterer.getBounds(), {
                    checkZoomRange: true,
                    zoomMargin: 20
                });
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
            this.selectedPoint = point;
            
            // Обновляем выбранную точку в списке
            $('.cdek-pickup-item').removeClass('selected');
            $('.cdek-pickup-item[data-code="' + point.code + '"]').addClass('selected');
            $('.cdek-pickup-item[data-code="' + point.code + '"] input[type="radio"]').prop('checked', true);
            
            // Показываем информацию о выбранной точке
            var schedule = this.formatSchedule(point.work_time);
            $('#cdek-selected-point .cdek-selected-info').html(
                '<strong>' + (point.name || 'Пункт выдачи CDEK') + '</strong><br>' +
                point.location.address_full + '<br>' +
                '<small>' + schedule + '</small>'
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
            this.showNotification('Выбран пункт выдачи: ' + (point.name || 'CDEK'));
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
            var $list = $('#cdek-pickup-list');
            var html = '';
            
            if (!pickupPoints || pickupPoints.length === 0) {
                $list.html('<div class="cdek-error">Пункты выдачи не найдены</div>');
                return;
            }
            
            for (var i = 0; i < pickupPoints.length; i++) {
                var point = pickupPoints[i];
                var schedule = this.formatSchedule(point.work_time);
                
                html += '<div class="cdek-pickup-item" data-code="' + point.code + '">' +
                    '<input type="radio" name="cdek_pickup_point" value="' + point.code + '" id="pickup_' + point.code + '">' +
                    '<label for="pickup_' + point.code + '">' +
                    '<div class="cdek-pickup-name">' + (point.name || 'Пункт выдачи CDEK') + '</div>' +
                    '<div class="cdek-pickup-address">' + point.location.address_full + '</div>' +
                    '<div class="cdek-pickup-schedule">' + schedule + '</div>' +
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
        
        formatSchedule: function(workTime) {
            if (!workTime || workTime.length === 0) {
                return 'Режим работы не указан';
            }
            
            var schedule = [];
            for (var i = 0; i < workTime.length; i++) {
                var day = workTime[i];
                var dayName = this.getDayName(day.day);
                var time = '';
                
                if (day.time) {
                    time = day.time;
                } else {
                    time = 'Закрыто';
                }
                
                schedule.push(dayName + ': ' + time);
            }
            
            return schedule.join(', ');
        },
        
        getDayName: function(dayNumber) {
            var days = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
            return days[dayNumber] || 'День ' + dayNumber;
        },
        
        hidePickupPoints: function() {
            $('#cdek-pickup-list').empty();
            $('#cdek-selected-point').hide();
        }
    };
    
    // Initialize when document is ready
    cdekShipping.init();
    
    // Re-initialize on checkout updates
    $(document).on('updated_checkout', function() {
        setTimeout(function() {
            cdekShipping.init();
        }, 100);
    });
    
    // For block checkout
    if (typeof wp !== 'undefined' && wp.hooks) {
        wp.hooks.addAction('experimental__woocommerce_blocks-checkout-render-checkout-form', 'cdek-shipping', function() {
            setTimeout(function() {
                cdekShipping.init();
            }, 500);
        });
    }
});