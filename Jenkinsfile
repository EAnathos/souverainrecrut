pipeline {
    agent any

    // Outil déclaré dans jenkins/casc/jenkins.yaml
    tools {
        nodejs 'Node 22'
    }

    environment {
        // Credential "Secret text" déclaré dans jenkins/casc/jenkins.yaml
        SONAR_TOKEN = credentials('sonar-token')
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

        stage('Analyse SonarQube') {
            steps {
                dir('backend') {
                    // Serveur "SonarCloud" déclaré dans jenkins/casc/jenkins.yaml
                    withSonarQubeEnv('SonarCloud') {
                        sh 'npx --yes @sonar/scan -Dsonar.token=$SONAR_TOKEN'
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
            // GIT_BRANCH vaut "origin/Dev" ou "Dev" selon le type de job
            when {
                expression { env.GIT_BRANCH ==~ /(.*\/)?(main|Dev)/ }
            }
            steps {
                dir('backend') {
                    sh """
                        docker build \
                          -t souverainrecrut-backend:${env.BUILD_NUMBER} \
                          -t souverainrecrut-backend:latest \
                          .
                    """
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
