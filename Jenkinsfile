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
                    sh 'docker build -t $IMAGE:$BUILD_NUMBER .'
                }
            }
        }

        stage('Scan Trivy') {
            steps {
                // Trivy tourne dans un conteneur frère et lit l'image via le socket Docker de l'hôte
                sh '''
                    docker run --rm \
                      -v /var/run/docker.sock:/var/run/docker.sock \
                      -v trivy-cache:/root/.cache/ \
                      aquasec/trivy:0.58.1 image \
                        --exit-code 1 \
                        --severity HIGH,CRITICAL \
                        --ignore-unfixed \
                        --no-progress \
                        $IMAGE:$BUILD_NUMBER
                '''
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
                    sh '''
                        case "$GIT_BRANCH" in
                          *main) CHANNEL=latest ;;
                          *)     CHANNEL=dev ;;
                        esac
                        REPO="$DOCKERHUB_USER/$IMAGE"

                        echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USER" --password-stdin
                        docker tag $IMAGE:$BUILD_NUMBER $REPO:$BUILD_NUMBER
                        docker tag $IMAGE:$BUILD_NUMBER $REPO:$CHANNEL
                        docker push $REPO:$BUILD_NUMBER
                        docker push $REPO:$CHANNEL
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
