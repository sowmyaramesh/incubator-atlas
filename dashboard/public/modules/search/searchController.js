/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

angular.module('dgc.search').controller('searchController', ['$scope', '$location', '$http', '$state', '$stateParams', 'lodash', 'searchResource', 'detailsResource', 'notificationService', 'atlasConfig',
    function($scope, $location, $http, $state, $stateParams, _, searchResource, detailsResource, notificationService, atlasConfig) {

        $scope.results = [];
        $scope.resultCount = 0;
        $scope.isCollapsed = true;
        $scope.currentPage = 1;
        $scope.itemsPerPage = 10;
        $scope.filteredResults = [];
        $scope.resultRows = [];
        $scope.resultType = '';
        $scope.isObject = angular.isObject;
        $scope.isString = angular.isString;
        $scope.isArray = angular.isArray;
        $scope.isNumber = angular.isNumber;
        $scope.searchTypes = atlasConfig.SEARCH_TYPE;
        $scope.mapAttr = ['guid', 'typeName', 'owner', 'description', 'createTime', '$traits$', '$id$', 'comment', 'dataType'];

        $scope.setPage = function(pageNo) {
            $scope.currentPage = pageNo;
        };

        $scope.initalPage = function() {
            var begin = (($scope.currentPage - 1) * $scope.itemsPerPage),
                end = begin + $scope.itemsPerPage,
                currentRowData = [],
                res = [],
                count = 0,
                firstRowId = 0;

            if ($scope.transformedResults && $scope.transformedResults.length > 0) {
                currentRowData = $scope.transformedResults.slice(begin, end);
            }

            var getName = function(gid, obj) {
                detailsResource.get({
                    id: gid
                }, function(data) {
                    if (data.values && data.values.name) {
                        obj.name = data.values.name;
                    } else {
                        obj.name = gid;
                    }
                    res.push(obj);
                    count++;

                    $scope.filteredResults = res;
                    if (!$scope.transformedProperties && firstRowId === gid) {
                        $scope.transformedProperties = $scope.filterProperties();
                    }
                });
            };

            angular.forEach(currentRowData, function(value) {
                var objVal = value;

                if (objVal.guid && !objVal.name) {
                    if (!firstRowId) {
                        firstRowId = objVal.guid;
                    }
                    getName(objVal.guid, objVal);
                } else {
                    res.push(objVal);
                    count++;

                    $scope.filteredResults = res;
                    if (!$scope.transformedProperties) {
                        $scope.transformedProperties = $scope.filterProperties();
                    }
                }
            });
        };

        $scope.search = function(query, type) {
            $scope.results = [];
            notificationService.reset();
            $scope.limit = 4;
            $scope.searchMessage = 'load-gif';
            $scope.$parent.query = query;
            searchResource.search({
                query: query,
                searchType: type
            }, function searchSuccess(response) {
                $scope.resultCount = response.count;
                $scope.results = response.results;
                $scope.resultRows = ($scope.results && $scope.results.rows) ? $scope.results.rows : $scope.results;

                $scope.totalItems = $scope.resultCount;
                $scope.transformedResults = {};
                $scope.dataTransitioned = false;

                $scope.showText = "Text";
                if ($scope.searchTypeModel === $scope.searchTypes.dsl.value) {
                    $scope.showText = "DSL";
                }

                if ($scope.results) {
                    if (response.dataType) {
                        $scope.resultType = response.dataType.typeName;
                    } else if (response.results.dataType) {
                        $scope.resultType = response.results.dataType.typeName;
                    } else if (typeof response.dataType === 'undefined') {
                        $scope.resultType = "full text";
                    }
                    $scope.searchMessage = $scope.resultCount + ' results matching your ' + $scope.showText + '  search query ' + $scope.query + ' were found';
                } else {
                    $scope.searchMessage = '0 results matching your ' + $scope.showText + '  search query ' + $scope.query + ' were found';
                }

                if (response.dataType && response.dataType.typeName && response.dataType.typeName.toLowerCase().indexOf('table') === -1) {
                    $scope.dataTransitioned = true;
                    var attrDef = response.dataType.attributeDefinitions;
                    if (attrDef.length === 1) {
                        $scope.searchKey = attrDef[0].name;
                    } else {
                        angular.forEach(attrDef, function(value) {
                            if (value.dataTypeName === '__IdType') {
                                $scope.searchKey = value.name;
                            }
                        });
                        if ($scope.searchKey === undefined || $scope.searchKey === '') {
                            $scope.searchKey = '';
                        }
                    }
                    $scope.transformedResults = $scope.filterResults();
                } else if (typeof response.dataType === 'undefined') {
                    $scope.dataTransitioned = true;
                    $scope.searchKey = '';
                    $scope.transformedResults = $scope.filterResults();
                } else if (response.dataType.typeName && response.dataType.typeName.toLowerCase().indexOf('table') !== -1) {
                    $scope.searchKey = "Table";
                    $scope.transformedResults = $scope.resultRows;
                } else if (response.results.dataType && response.results.dataType.typeName && response.results.dataType.typeName.toLowerCase().indexOf('table') !== -1) {
                    $scope.searchKey = "Table";
                    $scope.transformedResults = $scope.resultRows;
                }

                $scope.$watch('currentPage + itemsPerPage', function() {
                    $scope.initalPage();
                    $scope.pageCount = function() {
                        return Math.ceil($scope.resultCount / $scope.itemsPerPage);
                    };
                    if ($scope.results.length < 1) {
                        notificationService.error('No Result found', false);
                    }
                });
            }, function searchError(err) {
                if (($scope.searchTypeModel === $scope.searchTypes.dsl.value) && err.status === 400) {
                    $scope.searchMessageDsl = true;
                    $scope.searchMessage = false;
                } else {
                    $scope.searchMessageDsl = false;
                    $scope.searchMessage = true;
                    $scope.searchMessage = '0 results matching your ' + $scope.showText + '  search query ' + $scope.query + ' were found';
                    notificationService.error('Error occurred during executing search query, error status code = ' + err.status + ', status text = ' + err.statusText, false);
                }

            });
            $state.go('search', {
                query: query
            }, {
                location: 'replace'
            });
        };

        $scope.filterResults = function() {
            var res = [];

            if ($scope.searchKey !== '') {
                angular.forEach($scope.resultRows, function(value) {
                    var objVal = value[$scope.searchKey];
                    res.push(objVal);
                });
            } else {
                angular.forEach($scope.resultRows, function(value) {
                    var objVal = {},
                        curVal = value,
                        onlyId = false,
                        traits = false;

                    if (curVal.name) {
                        objVal.name = curVal.name;
                        delete curVal.name;
                    }
                    angular.forEach(curVal, function(vl, ky) {
                        if ($scope.mapAttr.indexOf(ky) !== -1 || ky.indexOf('_col_') !== -1 || ky.toLowerCase().indexOf('name') !== -1) {
                            if (ky === '$id$') {
                                objVal.id = curVal[ky].id;
                                onlyId = true;
                                traits = true;
                            } else if (ky.indexOf('$') === -1) {
                                objVal[ky] = vl;
                                onlyId = false;
                            }
                        }
                    });

                    if (traits) {
                        objVal.$traits$ = curVal.$traits$ || {};
                        objVal.Tools = objVal.id;
                    }

                    if (onlyId) {
                        objVal.guid = objVal.id;
                    }
                    res.push(objVal);
                });
            }
            return res;
        };

        $scope.filterProperties = function() {
            var results = $scope.transformedResults,
                pro = [];
            if (results && results.length > 0) {
                var result = results[0];
                if (typeof result === 'object') {
                    angular.forEach(result, function(value, key) {
                        if (key.indexOf('$typeName$') === -1) {
                            pro.push(key);
                        }
                    });
                } else {
                    pro.push($scope.searchKey);
                }
            }
            return pro;
        };

        $scope.doToggle = function($event, el) {
            this.isCollapsed = !el;
        };

        $scope.openAddTagHome = function(traitId) {
            $state.go('addTagHome', {
                tId: traitId
            });
        };

        $scope.isTag = function(typename) {

            if (typename.indexOf("__tempQueryResultStruct") > -1 || $scope.searchKey === '') {
                return true;
            } else {
                return false;
            }
        };

        $scope.getResourceDataHome = function(event, id) {
            detailsResource.get({
                id: id
            }, function(data) {
                if ($scope.filteredResults !== null && Object.keys($scope.filteredResults).length > 0) {
                    angular.forEach($scope.filteredResults, function(obj, trait) {
                        if ((obj.$id$ && obj.$id$.id.indexOf(id) > -1) || (obj.id && obj.id.indexOf(id) > -1)) {
                            $scope.filteredResults[trait].$traits$ = data.traits;
                        }
                    });
                }
            });
        };

        $scope.$on('refreshResourceData', $scope.getResourceDataHome);

        $scope.filterSearchResults = function(items) {
            var res = {};
            var count = 0;
            items = _.omit(items, ['name', 'description', 'guid']);
            angular.forEach(items, function(value, key) {
                if (typeof value !== 'object' && (key.indexOf('$$') < 0)) {
                    res[key] = value;
                    count++;
                }
            });
            $scope.keyLength = count;
            return res;
        };

        $scope.searchQuery = $location.search();
        $scope.searchTypeModel = $stateParams.searchType;
        $scope.query = ($location.search()).query;
        $stateParams.searchType = ($location.search()).searchType;
        if ($scope.query && $stateParams.searchType) {
            $scope.search($scope.query, $stateParams.searchType);
        }

        $scope.searchTypeChanged = function() {
            if ($scope.query) {
                $state.go('search', {
                    query: $scope.query,
                    searchType: $scope.searchTypeModel
                }, {
                    location: 'replace'
                });
            }
        };
    }
]);
