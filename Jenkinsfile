pipeline {
    agent any

    // Outil déclaré dans jenkins/casc/jenkins.yaml
    tools {
        nodejs 'Node 22'
    }

    environment {
        // Credential "Secret text" déclaré dans jenkins/casc/jenkins.yaml
        SONAR_TOKEN = credentials('sonar-token')
        IMAGE       = 'souverainrecrut-backend'
    }

    options {
        timeout(time: 15, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timestamps()
    }

    stages {

        stage('Install') {
            steps {
                dir('backend') {
                    sh 'node --version && npm --version'
                    sh 'npm ci'
                    sh 'npx prisma generate'
                }
            }
        }

        stage('Tests & Couverture') {
            steps {
                dir('backend') {
                    sh 'npm run test:coverage'
                }
            }
            post {
                always {
                    junit allowEmptyResults: true,
                          testResults: 'backend/reports/junit.xml'
                    publishHTML(target: [
                        allowMissing         : true,
                        alwaysLinkToLastBuild: true,
                        keepAll              : true,
                        reportDir            : 'backend/coverage',
                        reportFiles          : 'index.html',
                        reportName           : 'Couverture de code'
                    ])
                }
            }
        }

        stage('Analyse SonarQube & Quality Gate') {
            steps {
                dir('backend') {
                    // Serveur "SonarCloud" déclaré dans jenkins/casc/jenkins.yaml.
                    // qualitygate.wait : le scanner attend le verdict et échoue si le gate est rouge
                    // (évite un webhook SonarCloud -> Jenkins, impossible vers localhost).
                    withSonarQubeEnv('SonarCloud') {
                        sh '''
                            npx --yes @sonar/scan \
                              -Dsonar.token=$SONAR_TOKEN \
                              -Dsonar.qualitygate.wait=true \
                              -Dsonar.qualitygate.timeout=300
                        '''
                    }
                }
            }
        }

        stage('Build TypeScript') {
            steps {
                dir('backend') {
                    sh 'npm run build'
                }
            }
            post {
                success {
                    archiveArtifacts artifacts: 'backend/dist/**', fingerprint: true
                }
            }
        }

        stage('Build Image Docker') {
            steps {
                dir('backend') {
                    script {
                        // Tag traçable : version applicative (package.json) + commit court
                        env.APP_VERSION = sh(script: 'node -p "require(\'./package.json\').version"',
                                             returnStdout: true).trim()
                        env.IMAGE_TAG = "${env.APP_VERSION}-${env.GIT_COMMIT.take(7)}"
                    }
                    sh '''
                        docker build \
                          --build-arg VERSION=$APP_VERSION \
                          --build-arg VCS_REF=$GIT_COMMIT \
                          -t $IMAGE:$IMAGE_TAG \
                          .
                    '''
                    echo "Image construite : ${env.IMAGE}:${env.IMAGE_TAG}"
                }
            }
        }

        stage('Scan Trivy') {
            steps {
                // Trivy tourne dans un conteneur frère et lit l'image via le socket Docker de l'hôte.
                // 1) rapport complet, toutes sévérités, non bloquant (archivé)
                // 2) seuil bloquant : 0 HIGH / 0 CRITICAL ayant un correctif disponible
                sh '''
                    TRIVY="docker run --rm \
                      -v /var/run/docker.sock:/var/run/docker.sock \
                      -v trivy-cache:/root/.cache/ \
                      aquasec/trivy:0.58.1 image --no-progress"

                    $TRIVY --exit-code 0 --format table $IMAGE:$IMAGE_TAG > trivy-report.txt

                    $TRIVY --exit-code 1 --severity HIGH,CRITICAL --ignore-unfixed $IMAGE:$IMAGE_TAG
                '''
            }
            post {
                always {
                    archiveArtifacts artifacts: 'trivy-report.txt', allowEmptyArchive: true
                }
            }
        }

        stage('Publication Docker Hub') {
            // Atteint seulement si tous les contrôles précédents ont réussi.
            // GIT_BRANCH vaut "origin/Dev" ou "Dev" selon le type de job.
            when {
                expression { env.GIT_BRANCH ==~ /(.*\/)?(main|Dev)/ }
            }
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub',
                                                  usernameVariable: 'DOCKERHUB_USER',
                                                  passwordVariable: 'DOCKERHUB_TOKEN')]) {
                    // Seule l'image Backend est publiée (aucune image de base de données)
                    sh '''
                        REPO="$DOCKERHUB_USER/$IMAGE"
                        # <version>-<commit> : tag immuable et traçable ; dev / latest : canal mobile
                        case "$GIT_BRANCH" in
                          *main) TAGS="$IMAGE_TAG $APP_VERSION latest" ;;
                          *)     TAGS="$IMAGE_TAG dev" ;;
                        esac

                        echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USER" --password-stdin
                        for T in $TAGS; do
                          docker tag $IMAGE:$IMAGE_TAG $REPO:$T
                          docker push $REPO:$T
                        done
                    '''
                }
            }
            post {
                always {
                    sh 'docker logout || true'
                }
            }
        }
    }

    post {
        success {
            echo "Pipeline OK sur ${env.GIT_BRANCH} (${env.GIT_COMMIT?.take(7)})"
        }
        failure {
            echo 'Pipeline en échec : voir les logs du stage en rouge.'
        }
        always {
            cleanWs()
        }
    }
}
