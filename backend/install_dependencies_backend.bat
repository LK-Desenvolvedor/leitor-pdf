@echo off
echo Instalando dependências do npm...

npm install bcrypt@^5.1.1
npm install bcryptjs@^2.4.3
npm install body-parser@^1.20.2
npm install cors@^2.8.5
npm install dotenv@^16.4.5
npm install express@^4.19.2
npm install jsonwebtoken@^9.0.2
npm install mongoose@^8.4.1
npm install multer@^1.4.5-lts.1

echo Instalando dependências de desenvolvimento...

npm install nodemon@^3.1.3 --save-dev
npm install swagger-jsdoc@^6.2.8 --save-dev
npm install swagger-ui-express@^5.0.1 --save-dev

echo Todas as dependências foram instaladas com sucesso!
pause
