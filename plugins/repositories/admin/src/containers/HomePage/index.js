import React, { memo, useEffect, useState } from 'react';
import { Header } from '@buffetjs/custom';
import { Table } from '@buffetjs/core';
import styled from 'styled-components';
import axios from 'axios';

const Wrapper = styled.div`
  padding: 18px 30px;

  p {
    margin-top: 1rem;
  }
`;

const HomePage = () => {
  const [repositories, setRepositories] = useState([]);

  const headers = [
    {
      name: 'Name',
      value: 'name',
    },
    {
      name: 'Description',
      value: 'description',
    },
    {
      name: 'Url',
      value: 'html_url',
    },
  ];
  
  useEffect(() => {
      axios
        .get('https://api.github.com/users/Rofram/repos')
        .then(({ data }) => setRepositories(data))
        .catch((e) => strapi.notification.error(`Ops... github API error ${e}`));
  }, [setRepositories]);

  return (
    <Wrapper>
      <Header 
        title={{ label: "GitHub Repositories" }}
        content="A list of our repositories in Github"
      />
      <Table headers={headers} rows={repositories} />
    </Wrapper>
  );
};

export default memo(HomePage);
