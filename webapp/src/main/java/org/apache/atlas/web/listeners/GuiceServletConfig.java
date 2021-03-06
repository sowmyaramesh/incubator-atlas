/**
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

package org.apache.atlas.web.listeners;

import com.google.inject.Guice;
import com.google.inject.Injector;
import com.google.inject.Key;
import com.google.inject.Module;
import com.google.inject.Provider;
import com.google.inject.TypeLiteral;
import com.google.inject.servlet.GuiceServletContextListener;
import com.sun.jersey.api.core.PackagesResourceConfig;
import com.sun.jersey.guice.JerseyServletModule;
import com.sun.jersey.guice.spi.container.servlet.GuiceContainer;
import com.thinkaurelius.titan.core.TitanGraph;
import com.tinkerpop.blueprints.Graph;
import org.apache.atlas.ApplicationProperties;
import org.apache.atlas.AtlasClient;
import org.apache.atlas.AtlasException;
import org.apache.atlas.RepositoryMetadataModule;
import org.apache.atlas.ha.HAConfiguration;
import org.apache.atlas.notification.NotificationModule;
import org.apache.atlas.repository.graph.GraphProvider;
import org.apache.atlas.service.Services;
import org.apache.atlas.web.filters.ActiveServerFilter;
import org.apache.atlas.web.filters.AtlasAuthenticationFilter;
import org.apache.atlas.web.filters.AuditFilter;
import org.apache.atlas.web.service.ActiveInstanceElectorModule;
import org.apache.atlas.web.service.ServiceModule;
import org.apache.commons.configuration.Configuration;
import org.apache.commons.configuration.ConfigurationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.bridge.SLF4JBridgeHandler;

import javax.servlet.ServletContextEvent;
import java.util.HashMap;
import java.util.Map;

public class GuiceServletConfig extends GuiceServletContextListener {

    private static final Logger LOG = LoggerFactory.getLogger(GuiceServletConfig.class);

    private static final String GUICE_CTX_PARAM = "guice.packages";
    protected volatile Injector injector;

    @Override
    protected Injector getInjector() {
        LOG.info("Loading Guice modules");
        /*
         * More information on this can be found here:
		 * https://jersey.java.net/nonav/apidocs/1
		 * .11/contribs/jersey-guice/com/sun/jersey/guice/spi/container/servlet/package-summary
		 * .html
		 */
        if (injector == null) {

            // perform login operations
            LoginProcessor loginProcessor = new LoginProcessor();
            loginProcessor.login();

            injector = Guice.createInjector(getRepositoryModule(), new ActiveInstanceElectorModule(),
                    new NotificationModule(), new ServiceModule(), new JerseyServletModule() {

                        private Configuration appConfiguration = null;

                        private Configuration getConfiguration() {
                            if (appConfiguration == null) {
                                try {
                                    appConfiguration = ApplicationProperties.get();
                                } catch (AtlasException e) {
                                    LOG.warn("Could not load application configuration", e);
                                }
                            }
                            return appConfiguration;
                        }

                        @Override
                        protected void configureServlets() {
                            filter("/*").through(AuditFilter.class);
                            configureActiveServerFilterIfNecessary();
                            try {
                                configureAuthenticationFilter();
                            } catch (ConfigurationException e) {
                                LOG.warn("Unable to add and configure authentication filter", e);
                            }

                            String packages = getServletContext().getInitParameter(GUICE_CTX_PARAM);

                            LOG.info("Jersey loading from packages: " + packages);

                            Map<String, String> params = new HashMap<>();
                            params.put(PackagesResourceConfig.PROPERTY_PACKAGES, packages);
                            serve("/" + AtlasClient.BASE_URI + "*").with(GuiceContainer.class, params);
                        }

                        private void configureActiveServerFilterIfNecessary() {
                            Configuration configuration = getConfiguration();
                            if ((configuration == null) ||
                                    !HAConfiguration.isHAEnabled(configuration)) {
                                LOG.info("HA configuration is disabled, not activating ActiveServerFilter");
                            } else {
                                filter("/*").through(ActiveServerFilter.class);
                            }
                        }

                        private void configureAuthenticationFilter() throws ConfigurationException {
                            Configuration configuration = getConfiguration();
                            if (configuration == null) {
                                throw new ConfigurationException("Could not load application configuration");
                            }
                            if (Boolean.valueOf(configuration.getString(AtlasClient.HTTP_AUTHENTICATION_ENABLED))) {
                                LOG.info("Enabling AuthenticationFilter");
                                filter("/*").through(AtlasAuthenticationFilter.class);
                            }
                        }
                    });

            LOG.info("Guice modules loaded");
        }

        return injector;
    }

    protected Module getRepositoryModule() {
        return new RepositoryMetadataModule();
    }

    @Override
    public void contextInitialized(ServletContextEvent servletContextEvent) {
        super.contextInitialized(servletContextEvent);

        installLogBridge();

        startServices();
    }

    protected void startServices() {
        LOG.info("Starting services");
        Services services = injector.getInstance(Services.class);
        services.start();
    }

    /**
     * Maps jersey's java.util.logging to slf4j
     */
    private void installLogBridge() {
        // Optionally remove existing handlers attached to j.u.l root logger
        SLF4JBridgeHandler.removeHandlersForRootLogger();  // (since SLF4J 1.6.5)

        // add SLF4JBridgeHandler to j.u.l's root logger, should be done once during
        // the initialization phase of your application
        SLF4JBridgeHandler.install();
    }

    @Override
    public void contextDestroyed(ServletContextEvent servletContextEvent) {
        super.contextDestroyed(servletContextEvent);
        if(injector != null) {
            TypeLiteral<GraphProvider<TitanGraph>> graphProviderType = new TypeLiteral<GraphProvider<TitanGraph>>() {};
            Provider<GraphProvider<TitanGraph>> graphProvider = injector.getProvider(Key.get(graphProviderType));
            final Graph graph = graphProvider.get().get();

            try {
                graph.shutdown();
            } catch(Throwable t) {
                LOG.warn("Error while shutting down graph", t);
            }

            //stop services
            stopServices();
        }
    }

    protected void stopServices() {
        LOG.debug("Stopping services");
        Services services = injector.getInstance(Services.class);
        services.stop();
    }
}